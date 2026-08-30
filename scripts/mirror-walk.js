#!/usr/bin/env node
/**
 * Usage:
 *   node scripts/mirror-walk.js [--scope <substr>]     walk the Mirrored Surface Checklists
 *   node scripts/mirror-walk.js --surface G8 [--scope <substr>]
 *   node scripts/mirror-walk.js --list <specPath>
 *
 * WHY THIS EXISTS. Three of round 6's findings on the promote family were
 * sweeps that stopped one surface short, and in ALL THREE the Mirrored Surface
 * Checklist had already named the missed surface correctly. The discipline's
 * weakness was never its rule set; it was that nothing mechanically walked the
 * mirror lists the checklists already contain. This walks them.
 *
 * WHAT IT CHECKS (exit 1 on any failure, every offender named):
 *   1. Every TABLE LETTER named inside a Mirrored Surface Checklist entry
 *      resolves to a real "Table X" heading in that entry's resolution scope,
 *      at any heading level (specs use both ### and ####).
 *   2. Every docs/specs/*.md PATH named there exists on disk.
 *   3. That it walked something at all — a run that reaches ZERO entries EXITS
 *      1. An empty scan and a clean scan are otherwise indistinguishable, and
 *      this house already treats the absence case that way everywhere else: the
 *      specs guard every `--test-name-pattern` run with `test -f` because a
 *      pattern matching nothing exits 0 with a pass count. Measured here: run
 *      from outside the repo root, or with a misspelled `--scope`, this printed
 *      a clean verdict over zero specs.
 *
 * AND THE REVERSE INDEX, which is the half that earned the tool: `--surface G8`
 * answers "which checklist entries name this surface" — the query whose absence
 * produced three of round 6's nine findings, each a sweep that stopped one
 * surface short of a mirror its own checklist had already named.
 *
 * RESOLUTION SCOPE, because table letters are PER-SPEC and a tree-wide index
 * makes every letter ambiguous: an entry's references resolve against its OWN
 * spec plus every spec that spec reaches — by full path, by bare WP id, or via
 * `depends_on`. A row id that resolves nowhere in that scope is the failure.
 *
 * WHAT IT DOES NOT CHECK, stated so nobody reads a green run as more than it is:
 *   - whether a named surface was CORRECTLY SWEPT. It cannot read a sweep.
 *     A green run says the mirrors point at something real, nothing more.
 *   - whether a mirror list is COMPLETE. An UNREGISTERED mirror is invisible
 *     here; only a human or a review gate finds those.
 *   - mirrors named in prose ("the decided-bytes acceptance criterion",
 *     "Current state's validate.js bullet"). --list prints the entry so a
 *     sweeper reads them; they are not mechanically resolvable.
 *   - THAT A NAMED ROW ID RESOLVES, WHENEVER ITS LETTER IS AMBIGUOUS IN SCOPE.
 *     Row ids ARE resolved and DO fail — but only where the letter names
 *     exactly one table in scope. Where two specs in scope both define that
 *     letter, the reference is reported as AMBIGUOUS and never failed, and a
 *     row that exists in NEITHER owner passes with it. **Measured on
 *     2026-08-30, which is why this text was rewritten twice:** breaking
 *     `Q8` -> `Q88` inside a promote-family checklist entry left the run at
 *     exit 0, because Table Q is defined both here and in
 *     `docs/specs/done/WP-secret-fence-ep2-redact-arm.md`. The ambiguity branch
 *     short-circuits the existence check.
 *     THE CONSEQUENCE IS WORST EXACTLY WHERE THIS TOOL WAS BUILT: the promote
 *     family shares B, H, N, Q and R with that shipped package, so its own row
 *     references get no row-level protection at all. A green run over this
 *     family asserts table existence, path existence and non-vacuity — not
 *     rows. An earlier header claimed row resolution outright; a review gate
 *     proved that false, and a first correction claimed rows are never resolved,
 *     which the tree-wide output falsified in the other direction.
 *   - `<letter><n>` ids whose letter names no table in the scope. Other specs
 *     in this repo address Deliverables rows, verification commands and
 *     test-index rows with that same shape; those are SKIPPED and counted.
 *   - which of two colliding owners a row id means. Ambiguity inside a scope is
 *     REPORTED, never failed: the canonical map records those collisions as
 *     recorded-not-resolved, with prose qualification as the mitigation.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SPEC_DIRS = ['docs/specs', 'docs/specs/done'];
const CHECKLIST_HEADING = '### Mirrored Surface Checklist';

/** @returns {string[]} spec paths, repo-root relative */
function specFiles() {
  const out = [];
  for (const d of SPEC_DIRS) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (f.endsWith('.md') && fs.statSync(p).isFile()) out.push(p);
    }
  }
  return out.sort();
}

/**
 * @param {string} file
 * @returns {{rows: Set<string>, letters: Set<string>}} what this ONE spec declares
 */
function declaredIn(file) {
  const rows = new Set();
  const letters = new Set();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const h = /^#{2,6}\s+Table\s+([A-Z])\b/.exec(line);
    if (h) letters.add(h[1]);
    // First cell of a table row: "| C1 |", "| Y4 — ...", "| **Q10** |".
    const r = /^\|\s*\*{0,2}([A-Z]\d{1,2})\*{0,2}\s*(\||—|-)/.exec(line);
    if (r) rows.add(r[1]);
  }
  return { rows, letters };
}

/**
 * The RESOLUTION SCOPE of a spec: itself, plus every other spec it reaches —
 * named by full path, named by bare WP id, or listed in `depends_on`. All three
 * forms are in live use in this repo, and a scope that missed any of them would
 * report a correct sibling citation as unresolved.
 * @param {string} file
 * @returns {string[]} spec paths
 */
function resolutionScope(file) {
  const text = fs.readFileSync(file, 'utf8');
  const out = new Set([file]);
  for (const p of text.match(/docs\/specs\/[A-Za-z0-9._/-]+\.md/g) || []) {
    if (fs.existsSync(p)) out.add(p);
  }
  const deps = /^depends_on:\s*\[([^\]]*)\]/m.exec(text);
  const ids = new Set(text.match(/\bWP-[A-Za-z0-9-]+/g) || []);
  if (deps) for (const d of deps[1].split(',')) ids.add(d.trim());
  for (const id of ids) {
    for (const cand of [`docs/specs/${id}.md`, `docs/specs/done/${id}.md`]) {
      if (fs.existsSync(cand)) out.add(cand);
    }
  }
  return [...out];
}

/**
 * @param {string} file
 * @returns {{title: string, line: number, text: string}[]}
 */
function checklistEntries(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === CHECKLIST_HEADING);
  if (start === -1) return [];
  const entries = [];
  let cur = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{2,3}\s/.test(line)) break;
    if (/^- \[[ x]\]/.test(line)) {
      if (cur) entries.push(cur);
      cur = { title: line.replace(/^- \[[ x]\]\s*/, '').trim(), line: i + 1, text: line };
    } else if (cur) {
      cur.text += '\n' + line;
    }
  }
  if (cur) entries.push(cur);
  return entries;
}

/**
 * Strip review-FINDING ids so one never masquerades as a mirror: "round 5's
 * C4", "round (d)'s A", "round 6's CD-1", "round 4's F-3", "round 3, F2".
 * @param {string} text
 */
function stripFindingIds(text) {
  return text
    .replace(/round\s+(?:\d+|\([a-z]\))(?:'s|s'|,)?\s*(?:(?:and|,)?\s*[A-Z]{1,3}-?\d{0,2}\b)+/gi, ' ')
    .replace(/\b(?:CD|COH|NIT)-\d{1,2}\b/g, ' ')
    .replace(/\bADR-\d+/g, ' ')
    .replace(/\bWP-[A-Za-z0-9-]+/g, ' ');
}

/** @param {string} text */
function referencesIn(text) {
  const clean = stripFindingIds(text);
  const rows = new Set();
  const letters = new Set();
  const paths = new Set();
  const rowLead = /\brows?\s+((?:\*{0,2}[A-Z]\d{1,2}\*{0,2}[\s,]*(?:and\s+)?)+)/g;
  let m;
  while ((m = rowLead.exec(clean)) !== null) {
    for (const id of m[1].match(/[A-Z]\d{1,2}/g) || []) rows.add(id);
  }
  for (const b of clean.match(/\*\*([A-Z]\d{1,2})\*\*/g) || []) rows.add(b.replace(/\*/g, ''));
  for (const t of clean.match(/\bTable\s+([A-Z])\b/g) || []) letters.add(t.split(/\s+/)[1]);
  for (const p of text.match(/docs\/specs\/[A-Za-z0-9._/-]+\.md/g) || []) paths.add(p);
  return { rows: [...rows].sort(), letters: [...letters].sort(), paths: [...paths].sort() };
}

function main() {
  const args = process.argv.slice(2);
  const argOf = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  const scope = argOf('--scope');

  let files = specFiles();
  if (scope) files = files.filter((f) => f.includes(scope));

  /** @type {Map<string,{rows:Set<string>,letters:Set<string>}>} */
  const declCache = new Map();
  const decl = (f) => {
    if (!declCache.has(f)) declCache.set(f, declaredIn(f));
    return declCache.get(f);
  };

  const all = [];
  for (const file of files) {
    const reach = resolutionScope(file);
    for (const entry of checklistEntries(file)) {
      all.push({ file, reach, entry, refs: referencesIn(entry.text) });
    }
  }

  // ---- --surface <id>: the reverse index, the query no human step ran ----
  const want0 = argOf('--surface');
  if (want0 !== null) {
    const want = String(want0).replace(/^Table\s+/i, '');
    const isRow = /^[A-Z]\d{1,2}$/.test(want);
    if (!isRow && !/^[A-Z]$/.test(want)) {
      console.error('--surface needs a row id (G8) or a table letter (Y)');
      process.exit(1);
    }
    const hits = all.filter((a) => (isRow ? a.refs.rows : a.refs.letters).includes(want));
    const what = isRow ? `row ${want}` : `Table ${want}`;
    console.log(`${what} is named by ${hits.length} Mirrored Surface Checklist entr${hits.length === 1 ? 'y' : 'ies'}${scope ? ` (scope: ${scope})` : ''}:`);
    for (const h of hits) {
      console.log(`  ${h.file}:${h.entry.line}`);
      console.log(`      ${h.entry.title.replace(/\s+/g, ' ').slice(0, 140)}`);
    }
    if (!hits.length) console.log('  (none — no checklist registers this surface)');
    process.exit(0);
  }

  // ---- --list <spec> ----
  const listSpec = argOf('--list');
  if (listSpec) {
    for (const a of all.filter((x) => x.file === listSpec)) {
      console.log(`${a.file}:${a.entry.line}  ${a.entry.title.replace(/\s+/g, ' ').slice(0, 110)}`);
      console.log(`    rows:   ${a.refs.rows.join(', ') || '(none)'}`);
      console.log(`    tables: ${a.refs.letters.join(', ') || '(none)'}`);
      console.log(`    specs:  ${a.refs.paths.map((p) => path.basename(p)).join(', ') || '(none)'}`);
    }
    process.exit(0);
  }

  // ---- default: resolvability, in each entry's own resolution scope ----
  const failures = [];
  const ambiguous = [];
  const skipped = [];
  for (const a of all) {
    const owners = (kind, id) => a.reach.filter((f) => decl(f)[kind].has(id)).sort();
    for (const r of a.refs.rows) {
      // A LETTER WITH NO TABLE IN SCOPE IS NOT A TABLE REFERENCE. Specs across
      // this repo address other things with the same lexical shape — `D1` for a
      // Deliverables row, `V5` for a verification command, `T6` for a test-index
      // row — and only the presence of a "Table <letter>" heading in scope makes
      // `<letter><n>` a row citation. Without it the reference is SKIPPED and
      // counted, never failed: failing it would report another family's
      // addressing scheme as this family's defect.
      if (!owners('letters', r[0]).length) { skipped.push(`${a.file}:${a.entry.line} ${r} (no Table ${r[0]} in scope — not a table-row citation)`); continue; }
      const o = owners('rows', r);
      if (!o.length) failures.push(`${a.file}:${a.entry.line} names row ${r} — Table ${r[0]} is in scope and has no row ${r}`);
      else if (o.length > 1) ambiguous.push(`${a.file}:${a.entry.line} row ${r} → ${o.map((x) => path.basename(x)).join(' | ')}`);
    }
    for (const l of a.refs.letters) {
      const o = owners('letters', l);
      if (!o.length) failures.push(`${a.file}:${a.entry.line} names Table ${l} — no "Table ${l}" heading in its resolution scope`);
      else if (o.length > 1) ambiguous.push(`${a.file}:${a.entry.line} Table ${l} → ${o.map((x) => path.basename(x)).join(' | ')}`);
    }
    for (const p of a.refs.paths) {
      if (!fs.existsSync(p)) failures.push(`${a.file}:${a.entry.line} names spec path ${p}, which does not exist`);
    }
  }

  const specsWithChecklists = new Set(all.map((a) => a.file)).size;
  // VACUITY GUARD. Zero walked entries EXITS 1. A run that reached nothing and a
  // run that found nothing wrong print the same verdict otherwise, and this
  // house already treats the absence case that way everywhere else — the specs
  // guard every `--test-name-pattern` run with `test -f` because a pattern
  // matching nothing exits 0 with a pass count. Measured: run from outside the
  // repo root, or with a misspelled `--scope`, this printed a clean verdict over
  // zero specs.
  if (all.length === 0) {
    console.error(
      `mirror-walk: walked ZERO checklist entries${scope ? ` for scope "${scope}"` : ''} — ` +
        'nothing was checked. Run it from the repository root, and check the --scope spelling.'
    );
    process.exit(1);
  }
  console.log(`mirror-walk${scope ? ` (scope: ${scope})` : ''}: ${all.length} checklist entries across ${specsWithChecklists} specs (${files.length} scanned)`);
  console.log(`  row references: ${all.reduce((n, a) => n + a.refs.rows.length, 0)}   table references: ${all.reduce((n, a) => n + a.refs.letters.length, 0)}   spec-path references: ${all.reduce((n, a) => n + a.refs.paths.length, 0)}`);
  if (skipped.length) {
    console.log(`  skipped: ${skipped.length} id${skipped.length === 1 ? '' : 's'} whose letter names no table in scope (another addressing scheme, not a mirror)${args.includes('--skipped') ? ':' : ' — --skipped lists them'}`);
    if (args.includes('--skipped')) for (const x of skipped) console.log(`    ${x}`);
  }
  if (ambiguous.length) {
    console.log(`\nAMBIGUOUS — ${ambiguous.length} reference${ambiguous.length === 1 ? '' : 's'}. Reported, NEVER failed: the canonical table-letter map records these collisions as resolved by prose qualification, which no parser can check. Distinct colliding surfaces:`);
    const byId = new Map();
    for (const x of ambiguous) {
      const key = x.slice(x.indexOf(' ') + 1);
      byId.set(key, (byId.get(key) || 0) + 1);
    }
    for (const [k, n] of [...byId.entries()].sort()) console.log(`  ${k}   (${n} entr${n === 1 ? 'y' : 'ies'})`);
    if (!args.includes('--ambiguous')) console.log('  (--ambiguous lists every site)');
    else { console.log('  sites:'); for (const x of ambiguous) console.log(`    ${x}`); }
  }
  if (failures.length) {
    console.log(`\nUNRESOLVED — ${failures.length}:`);
    for (const f of failures) console.log(`  ${f}`);
    process.exit(1);
  }
  console.log(
    '\nEvery TABLE and SPEC PATH named in these checklists resolves, and the walk was not vacuous.\n' +
      'NOT CLAIMED: that any surface was SWEPT, that a mirror list is COMPLETE, or that row ids\n' +
      'resolve where their letter is ambiguous in scope (see the header).'
  );
  process.exit(0);
}

main();
