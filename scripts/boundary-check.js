#!/usr/bin/env node
/** Usage: node scripts/boundary-check.js <specPath> <changedFile...>
 *  Parses the spec's "## Deliverables" markdown table (rows: | Action | Path | Notes |),
 *  exits 0 if every changedFile is listed (exact path match) or is the spec file itself,
 *  else prints offending paths and exits 1. The spec file and docs/specs/ROADMAP.md
 *  are always allowed (status flips). */
'use strict';
const fs = require('node:fs');

/** @param {string} specText @returns {string[]} */
function parseDeliverables(specText) {
  const lines = specText.split('\n');
  const start = lines.findIndex((l) => l.trim().startsWith('## Deliverables'));
  if (start === -1) return [];

  const paths = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at ANY heading (including "### Exact contracts") so tables in
    // subsections cannot silently widen the allowed set.
    if (/^#{2,}\s/.test(line)) break;
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 2) continue;
    if (cells[0] === 'Action' || /^-+$/.test(cells[0])) continue;
    paths.push(cells[1]);
  }
  return paths;
}

function main() {
  const [, , specPath, ...changedFiles] = process.argv;
  if (!specPath || changedFiles.length === 0) {
    console.error('Usage: node scripts/boundary-check.js <specPath> <changedFile...>');
    process.exit(1);
  }

  const specText = fs.readFileSync(specPath, 'utf8');
  const allowed = new Set(parseDeliverables(specText));
  allowed.add(specPath);
  allowed.add('docs/specs/ROADMAP.md');
  // Lockfile churn legitimately accompanies package.json changes.
  allowed.add('package-lock.json');
  // One appended dogfood lesson per session is allowed by CLAUDE.md.
  allowed.add('memory/lessons/inbox.md');

  // Deliverables entries ending in '/' allow the whole directory tree.
  const dirPrefixes = [...allowed].filter((p) => p.endsWith('/'));
  const isAllowed = (f) =>
    allowed.has(f) || dirPrefixes.some((d) => f.startsWith(d));

  const offenders = changedFiles.filter((f) => !isAllowed(f));
  if (offenders.length > 0) {
    console.error("Files outside the spec's Deliverables table:");
    for (const f of offenders) console.error(`  ${f}`);
    process.exit(1);
  }

  process.exit(0);
}

main();
