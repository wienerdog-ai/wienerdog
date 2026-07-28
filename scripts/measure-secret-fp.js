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
 * matched run, never a line of vault prose, never a filename outside the
 * vault-relative form, and NEVER THE VAULT PATH ITSELF. Its output is meant to
 * be pasted into a PR body, so treat every byte of it as public: the documented
 * invocation writes `~/Obsidian/…`, but the shell expands that to an absolute
 * path carrying the developer's username and the vault's location, so the
 * report prints a fixed placeholder instead of echoing the argument.
 *
 * The `today` column is the SHIPPED detector, REPRODUCED IN ITS OWN ORDER:
 * the labelled rules run FIRST and replace their matches, and only what
 * survives reaches a CONTEXT-FREE entropy pass over `[A-Za-z0-9+/=]{24,}` at
 * the same floor. Getting that order wrong counts a labelled credential as an
 * entropy hit as well, which corrupts M1's source breakdown and its occurrence
 * totals. The labelled half is observed through the shared module minus the one
 * label this WP ADDS (`basic-auth`); the entropy half is the lines below.
 *
 * THE EMULATION IS A PREVIOUS VERSION OF A PIPELINE, SO EVERY RULE THE CURRENT
 * VERSION ADDS IS A SOURCE OF ERROR. It runs the module's CURRENT labelled
 * stage, which includes `basic-auth` — a rule the shipped detector did not
 * have. Where that rule matches, it consumes a body the shipped entropy pass
 * would have been handed, and every M1 figure would be understated. This script
 * therefore REFUSES TO EMIT any measurement on such a corpus rather than
 * printing a caveat beside one: a number that is printed will be quoted.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { scanAndRedact, ScanLimits } = require('../src/core/secret-scan');

const SKIP_DIRS = new Set(['.git', '.obsidian', '.trash']);
const ADDED_BY_THIS_WP = 'basic-auth';
// Never echo the argument: the documented invocation is a private absolute path.
const VAULT_LABEL = '<the path given on the command line>';

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

/** The runs the SHIPPED entropy pass would have replaced, given the text AS THAT
 *  PASS SEES IT — i.e. after the labelled rules have run.
 *  @param {string} afterLabelled @returns {string[]} */
function shippedEntropyRuns(afterLabelled) {
  return (afterLabelled.match(SHIPPED_CANDIDATE) || []).filter(
    (run) => bitsPerChar(run) >= SHIPPED_MIN_BITS_PER_CHAR,
  );
}

// --- the pipeline order -----------------------------------------------------

// `scanAndRedact` runs the labelled rules first and the entropy pass second,
// reading the entropy FLOOR from `ScanLimits` on every candidate. Putting the
// floor out of reach therefore turns the entropy stage into a no-op and leaves
// exactly the intermediate text the shipped entropy pass would have been handed:
// labelled matches already replaced, nothing else touched. That is a use of the
// module's own ordering rather than a second copy of eighteen rules — but it
// depends on the floor being read at call time, so `assertEntropyIsSuppressible`
// below proves it on a known-high-entropy probe and refuses to report if it ever
// stops holding.

/** @param {string} text @returns {string} the text after the labelled rules only */
function afterLabelledRules(text) {
  const floor = ScanLimits.ENTROPY_MIN_BITS_PER_CHAR;
  ScanLimits.ENTROPY_MIN_BITS_PER_CHAR = Infinity;
  try {
    return scanAndRedact(text).text;
  } finally {
    ScanLimits.ENTROPY_MIN_BITS_PER_CHAR = floor;
  }
}

/** @returns {boolean} true iff `afterLabelledRules` really suppresses the entropy stage */
function assertEntropyIsSuppressible() {
  const probe = 'blob q7PmXz4KvR9tWc2LbN8dYfGh end';
  const suppressed = afterLabelledRules(probe);
  const normal = scanAndRedact(probe);
  return (
    suppressed === probe &&
    normal.findings.some((f) => f.label === 'high-entropy') &&
    ScanLimits.ENTROPY_MIN_BITS_PER_CHAR === SHIPPED_MIN_BITS_PER_CHAR
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
  /** @type {string[]} vault-relative paths of notes the ADDED rule matched */
  const addedLabelNotes = [];

  for (const file of notes) {
    const text = fs.readFileSync(file, 'utf8');
    const { findings } = scanAndRedact(text);

    // today — the labelled rules run FIRST, and only what survives them reaches
    // the shipped entropy pass.
    const labelled = findings.filter(
      (f) => f.label !== 'high-entropy' && f.label !== ADDED_BY_THIS_WP,
    );
    if (findings.some((f) => f.label === ADDED_BY_THIS_WP)) {
      addedLabelNotes.push(path.relative(vaultPath, file));
    }
    const runs = shippedEntropyRuns(afterLabelledRules(text));
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

  // REFUSE TO EMIT, before a single figure is printed. `basic-auth` is a rule
  // this WP ADDS; the shipped detector had none, so wherever it matched it
  // consumed a body the shipped entropy pass would have been handed. Every M1
  // figure below would be understated, and a warning beside a printed number
  // does not make the number reproducible — it makes it quotable.
  if (addedLabelNotes.length > 0) {
    console.error('FAIL: the M1 baseline is NOT reproducible on this corpus.');
    console.error('');
    console.error(
      `      The '${ADDED_BY_THIS_WP}' rule that this WP ADDS matched in ${addedLabelNotes.length} note(s).`,
    );
    console.error('      The shipped detector had no such rule, so it would have handed those');
    console.error('      bodies to its entropy pass — but this emulation runs the module\'s');
    console.error('      CURRENT labelled stage, which consumes them first. The note counts, the');
    console.error('      source breakdown, the occurrence totals and the distinct-run count would');
    console.error('      all be understated, so NOTHING is printed: there is no partial result to');
    console.error('      quote.');
    console.error('');
    console.error('      Notes, vault-relative:');
    for (const rel of addedLabelNotes) console.error(`        ${rel}`);
    console.error('');
    console.error('      Measuring THIS corpus needs a shipped-rule-only path: a labelled stage');
    console.error('      built from the rules that pre-date this WP rather than from the module\'s');
    console.error('      current one. That is deliberately NOT built here — it would be an');
    console.error('      unpinned second copy of the rule list, checked by nothing.');
    return 3;
  }

  const pct = notes.length ? ((100 * anyFindingToday) / notes.length).toFixed(1) : '0.0';
  const byRule = [`high-entropy ${entropyOccurrences} occurrences`]
    .concat([...labelledOccurrences].sort().map(([l, n]) => `${l} ${n}`))
    .join('  |  ');

  console.log(`vault: ${VAULT_LABEL}`);
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
    console.error('not a readable path: the path given on the command line');
    return 2;
  }
  if (!stat.isDirectory()) {
    console.error('not a directory: the path given on the command line');
    return 2;
  }
  if (!assertEntropyIsSuppressible()) {
    console.error(
      'the entropy stage can no longer be suppressed through ScanLimits, so the',
    );
    console.error(
      "labelled rules cannot be isolated and today's figures would be wrong. Refusing",
    );
    console.error('to report. Reproduce the shipped pipeline another way; do not guess.');
    return 2;
  }
  return measure(vaultPath);
}

process.exit(main());
