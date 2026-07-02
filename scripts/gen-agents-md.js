#!/usr/bin/env node
/**
 * scripts/gen-agents-md.js
 *
 * Renders CLAUDE.md (canonical implementer instructions) into AGENTS.md
 * for Codex CLI. AGENTS.md = HEADER + "\n" + contents of CLAUDE.md.
 *
 * Usage:
 *   node scripts/gen-agents-md.js          write AGENTS.md
 *   node scripts/gen-agents-md.js --check  exit 0 if AGENTS.md is already in
 *                                          sync, else print a one-line diff
 *                                          summary and exit 1
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CLAUDE_MD = path.join(ROOT, 'CLAUDE.md');
const AGENTS_MD = path.join(ROOT, 'AGENTS.md');

const HEADER =
  '<!-- GENERATED from CLAUDE.md — do not hand-edit. Regenerate with: npm run gen:agents. -->';

/**
 * @param {string} claudeMdContents
 * @returns {string}
 */
function render(claudeMdContents) {
  return `${HEADER}\n${claudeMdContents}`;
}

function main() {
  const check = process.argv.includes('--check');
  const claudeMdContents = fs.readFileSync(CLAUDE_MD, 'utf8');
  const expected = render(claudeMdContents);

  if (check) {
    const actual = fs.existsSync(AGENTS_MD)
      ? fs.readFileSync(AGENTS_MD, 'utf8')
      : null;
    if (actual === expected) {
      process.exit(0);
    }
    console.log(
      actual === null
        ? 'AGENTS.md is missing; run `npm run gen:agents`.'
        : 'AGENTS.md is out of sync with CLAUDE.md; run `npm run gen:agents`.'
    );
    process.exit(1);
  }

  fs.writeFileSync(AGENTS_MD, expected, 'utf8');
}

main();
