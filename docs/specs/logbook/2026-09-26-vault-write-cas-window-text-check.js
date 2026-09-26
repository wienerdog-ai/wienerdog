#!/usr/bin/env node
'use strict';
/**
 * Text checker for WP-vault-write-cas-window's disclosure texts and Done-spec
 * erratum (acceptance criteria AC9 and AC10).
 *
 * It reads the spec's OWN fenced literal blocks (D1–D5, E0–E9) and requires
 * each to appear VERBATIM in the file it belongs to, requires every shipped
 * sentence those blocks replace to be gone, and requires each erratum marker
 * `(Erratum 1, E<n>)` exactly once. It reads the blocks from the spec, not
 * from a copy, so it cannot drift from what the spec prescribes.
 *
 * Usage, from the repository root:
 *   node docs/specs/logbook/2026-09-26-vault-write-cas-window-text-check.js [--tree <dir>] [--spec <path>]
 * `--tree` is the root the edited files are read under (default: the current
 * directory). Exit 0 only when every check passes; a missing file is a FAIL.
 */
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const tree = opt('--tree', '.');
const specPath =
  opt('--spec', null) ||
  ['docs/specs/WP-vault-write-cas-window.md', 'docs/specs/done/WP-vault-write-cas-window.md'].find((p) =>
    fs.existsSync(p)
  );
if (!specPath) {
  console.log('FAIL the spec WP-vault-write-cas-window.md was not found');
  process.exit(1);
}
const spec = fs.readFileSync(specPath, 'utf8');

const VW = 'src/core/dream/vault-write.js';
const PR = 'src/core/dream/promote.js';
const DONE = 'docs/specs/done/WP-dream-vault-write-primitive.md';

/** The fenced ```text block following the line that starts with `label`. */
function block(label) {
  const at = spec.indexOf(`\n${label}`);
  if (at < 0) throw new Error(`the spec has no line starting with ${JSON.stringify(label)}`);
  if (spec.indexOf(`\n${label}`, at + 1) >= 0) throw new Error(`the label ${JSON.stringify(label)} is not unique`);
  const open = spec.indexOf('```text\n', at);
  const close = spec.indexOf('\n```', open + 8);
  return spec.slice(open + 8, close);
}
/** @param {string} rel @returns {string|null} */
function read(rel) {
  const abs = path.join(tree, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
}

let failed = 0;
const report = (ok, what) => {
  if (!ok) failed += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${what}`);
};

// 1. Every literal block is present verbatim where it belongs.
const placed = [
  ['D1 —', VW], ['D2 —', VW], ['D3 —', VW], ['D4 —', PR], ['D5 —', PR],
  ['E1 —', DONE], ['E2 —', DONE], ['E3 —', DONE], ['E4 —', DONE], ['E5 —', DONE],
  ['E6 —', DONE], ['E7 —', DONE], ['E8 —', DONE], ['E9 —', DONE],
];
for (const [label, file] of placed) {
  const text = read(file);
  report(text !== null && text.includes(block(label)), `${label.slice(0, 2)} verbatim in ${file}`);
}
// E0 carries a <DATE> placeholder: both halves verbatim, and a real date.
{
  const e0 = block('E0:');
  const [before, after] = e0.split('<DATE>');
  const text = read(DONE);
  report(text !== null && text.includes(before) && text.includes(after), `E0 verbatim (around <DATE>) in ${DONE}`);
  const heading = /^## Erratum 1 \(20\d{2}-\d{2}-\d{2}\) — the create arm's window is closed where hard links exist$/m;
  report(text !== null && heading.test(text), `E0 heading carries a real date in ${DONE}`);
}

// 2. Every shipped sentence a block replaces is gone. An absent file FAILS
//    here, so a missing deliverable can never read green.
const gone = [
  [VW, ' *      still lost. Narrowed, not closed.'],
  [VW, '    // The last acts before the rename, in this order and as close to it as'],
  [VW, '    // The rename is the publish. A reader of the target sees the previous'],
  [PR, '      // The compare→promote window is NARROWED, not closed: a vault change'],
  [PR, '              // untouched, the complete record goes to the caller, and the'],
  [DONE, '- [ ] Named residual: the compare→publish window is narrowed, not closed (H5).\n'],
  [DONE, '**NARROWED, not closed:** a write landing between the check and the publish is still lost'],
  [DONE, '**FOUR bounded cases, not two,'],
  [DONE, '**four**, owned by the H7 acceptance criterion'],
  [DONE, '**No surface may call the compare→publish window "closed",'],
];
for (const [file, old] of gone) {
  const text = read(file);
  report(text !== null && !text.includes(old), `shipped text gone from ${file}: ${JSON.stringify(old.trim().slice(0, 60))}`);
}

// 3. Each erratum marker exactly once.
{
  const text = read(DONE);
  for (let n = 1; n <= 9; n += 1) {
    const count = text === null ? 0 : text.split(`(Erratum 1, E${n})`).length - 1;
    report(count === 1, `marker (Erratum 1, E${n}) exactly once in ${DONE} (found ${count})`);
  }
}

console.log(failed === 0 ? 'text check: ALL PASS' : `text check: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
