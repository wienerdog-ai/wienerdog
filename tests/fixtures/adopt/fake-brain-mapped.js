#!/usr/bin/env node
'use strict';

// Controlled stand-in for the real dream brain, for the WP-026 adoption e2e. It
// is installed as the PINNED claude. Unlike the default fake brain (which writes
// hardcoded default-layout paths), this one reads the vault LAYOUT from
// WIENERDOG_DREAM_LAYOUT (JSON that WP-024's spawnBrain sets, with a
// `daily_today` = the resolved nested daily path) and writes through the MAPPED
// tiers of an adopted, non-default-layout vault. Must be directly executable,
// and self-contained: the installing test copies this single file.

const fs = require('node:fs');
const path = require('node:path');

// Answer the pinned-exec version probe (spawnPinnedSync claude --version) and
// stop. Load-bearing since the run date moved into the prompt: the probe carries
// no prompt, so without this it would write this scenario a second time at the
// DEFAULT date, into tier paths the real run never asked for.
if (process.argv.includes('--version')) {
  process.stdout.write('0.0.0 (wienerdog fake claude)\n');
  process.exit(0);
}

/**
 * The run date, read the way the REAL brain receives it (Table B's
 * fixture-control row): the prompt is an argv element on both arms and carries
 * the literal line `Today's date: <date>`. This fixture needs no control file —
 * the date was its ONLY ambient input; vault and layout already arrive in the
 * constructed WIENERDOG_DREAM_* values.
 * @param {string} fallback @returns {string}
 */
function promptDate(fallback) {
  for (const a of process.argv.slice(2)) {
    const m = /^Today's date: (.+)$/m.exec(String(a));
    if (m) return m[1].trim();
  }
  return fallback;
}

const vault = process.env.WIENERDOG_DREAM_VAULT;
const date = promptDate('2026-07-02');
const layout = JSON.parse(process.env.WIENERDOG_DREAM_LAYOUT || '{}');

/** @param {string} rel @param {string} content */
function write(rel, content) {
  const full = path.join(vault, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

// 1. Valid Tier-3 identity note through the MAPPED identity dir — satisfies the
//    confidence/recurrence floor and is not untrusted; must survive the gate.
write(
  path.join(layout.identity_dir, 'adopted-fact.md'),
  ['---', 'confidence: 0.9', 'recurrence: 3', 'derived_from_untrusted: false', '---', '', 'Priya bills clients by the report.', ''].join('\n')
);

// 2. Tier-1 daily entry at the resolved (nested) daily path; create parents.
write(
  layout.daily_today,
  ['---', 'type: daily', 'derived_from_untrusted: false', '---', '', `# ${date}`, '', 'Dreamed over recent sessions.', ''].join('\n')
);

// 3. Dream report through the MAPPED reports dir.
write(path.join(layout.reports_dir, `${date}.md`), `# Dream report — ${date}\n\nConsolidated recent sessions.\n`);

process.exit(0);
