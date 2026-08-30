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
 * THE CLAIM, NARROWED TO WHAT THE TOOL ACTUALLY DOES (owner ruling, 2026-08-30).
 * Two things, and nothing beyond them:
 *
 *   (A) THE REVERSE INDEX — `--surface G8` answers "which checklist entries name
 *       this surface". This is the half that earned the tool: its absence
 *       produced three of round 6's nine findings, each a sweep that stopped one
 *       surface short of a mirror its own checklist had already named.
 *
 *   (B) EXISTENCE, of the names it extracts — every TABLE LETTER resolves to a
 *       real "Table X" heading in that entry's resolution scope (specs use both
 *       ### and ####), every table-ROW id resolves to a row of a table in that
 *       scope, and every `docs/specs/*.md` PATH exists on disk. Exit 1 on any
 *       failure, every offender named.
 *
 *   Plus the guard that makes either of them mean anything: (C) THE VACUITY
 *   GUARD. A run that reads ZERO spec files, or reaches ZERO checklist entries,
 *   EXITS 1 IN EVERY MODE. An empty scan and a clean scan are otherwise
 *   indistinguishable, and this house already treats the deliverable-absent case
 *   as a required RED everywhere else: the specs guard every
 *   `--test-name-pattern` run with `test -f` because a pattern matching nothing
 *   exits 0 with a pass count. Measured before the guard existed — run from
 *   outside the repo root, with a misspelled `--scope`, with
 *   `--surface X --scope <typo>`, and with `--list <missing spec>` — each
 *   printed a clean verdict over zero entries and exited 0.
 *
 * IT RESOLVES NOTHING AT LINE LEVEL, and this is the narrowing's sharp edge.
 * Checklist entries are full of `src/core/dream/promote.js:680-681` citations.
 * This tool reads NONE of them. A green run says nothing whatever about whether
 * a `file:line` citation still points where it claims — the exact failure that
 * blocked two dispatches on 2026-08-30
 * (`docs/specs/logbook/2026-08-30-citation-rot-and-a-ninth-mirror.md`). Line
 * numbers rot on every insertion above them; this walker cannot see it.
 *
 * BOTH CHECKLIST FORMS ARE READ. Older specs register mirrors as `- [ ]` prose
 * bullets, one entry per bullet with its continuation lines. The promote family
 * was extracted to ADR-0031's canonical TABLE form on 2026-08-30 — one row per
 * registered contract, columns for the mirror set, the prohibitions and the walk
 * state. In the table form the DELIMITER row opens the registry, every following
 * pipe row is ONE entry, and the first non-pipe line closes it. Fenced blocks
 * inside the section (the module spec's preamble prints its derivation greps in
 * one) are skipped, so a fence's contents can never be read as entries.
 *
 * RESOLUTION SCOPE, because table letters are PER-SPEC and a tree-wide index
 * makes every letter ambiguous: an entry's references resolve against its OWN
 * spec plus every spec that spec reaches — by full path, by bare WP id, or via
 * `depends_on`. A row id that resolves nowhere in that scope is the failure.
 *
 * WHAT IT DOES NOT CHECK, stated so nobody reads a green run as more than it is.
 * The same list is printed as a REACH banner on every run, in every mode, so a
 * reader of the output never has to come here to learn what the output means:
 *   - LINE-LEVEL anything. See above. This is the largest gap by far.
 *   - whether a named surface was CORRECTLY SWEPT. It cannot read a sweep.
 *     A green run says the mirrors point at something real, nothing more.
 *   - whether a mirror list is COMPLETE. An UNREGISTERED mirror is invisible
 *     here; only a human or a review gate finds those.
 *   - mirrors named in prose ("the decided-bytes acceptance criterion",
 *     "Current state's validate.js bullet"). --list prints the entry so a
 *     sweeper reads them; they are not mechanically resolvable.
 *   - EVERY reference. It checks the ones it EXTRACTS, and the extractor is
 *     deliberately conservative. Two gaps measured on this corpus and left as
 *     they are: a range `Q1-Q3` written with an en dash yields only `Q1`, and a
 *     possessive `Q4's` with no `row`/`rows` lead and no bold is not extracted
 *     at all. Neither can produce a false GREEN on a reference it did extract.
 *   - `<letter><n>` ids whose letter names no table in the scope. Other specs
 *     in this repo address Deliverables rows, verification commands and
 *     test-index rows with that same shape; those are SKIPPED and counted.
 *   - which of two colliding owners a row id means. Ambiguity inside a scope is
 *     REPORTED, never failed: the canonical map records those collisions as
 *     recorded-not-resolved, with prose qualification as the mitigation.
 *
 * FIXED 2026-08-30, and it is why this file got its own branch and its own gate.
 * `stripFindingIds`' first regex was case-insensitive and its `\d{0,2}` permitted
 * ZERO digits, so its repeating group chewed through runs of <=3-letter words and
 * deleted real row citations along with them, BEFORE extraction:
 *     in : (round 6's CD-1, see row Y4)
 *     out: ( )
 * Whether a row id survived therefore depended on the PROSE AROUND IT, not on the
 * reference — which is why three separate attempts to describe the behaviour (two
 * by this file's author, one by a review gate) each looked locally right and
 * contradicted each other. Found by the second PR-gate round on PR #32; this file
 * was routed out of that PR so the fix could be gated on its own. The regex now
 * requires at least one digit and is case-anchored on the id, and both directions
 * are pinned in `tests/unit/mirror-walk.test.js`.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const SPEC_DIRS = ['docs/specs', 'docs/specs/done'];
const CHECKLIST_HEADING = '### Mirrored Surface Checklist';

/**
 * THE REACH BANNER — printed on EVERY run, in EVERY mode, success or failure.
 * The house pattern is that a checking tool names its own limits where its
 * OUTPUT is read, not only in its source: a tool that promises more than it
 * performs is worse than none, because a reader stops checking. Owner ruling,
 * 2026-08-30, narrowing this tool's claim to the reverse index plus existence.
 */
const REACH = [
  'REACH — what this run does and does not assert:',
  '  ASSERTS  the reverse index (--surface), and EXISTENCE of the names it extracted:',
  '           every table letter resolves to a "Table X" heading in scope, every table-row',
  '           id to a row of a table in scope, every docs/specs path to a file on disk.',
  '  ASSERTS  that the walk was NOT VACUOUS — zero files read or zero entries reached is',
  '           a RED, in every mode, never a clean verdict.',
  '  DOES NOT resolve anything at LINE level. No `file.js:120-130` citation in any entry',
  '           is read, so this says NOTHING about whether a citation still points where it',
  '           claims. Line numbers rot on every insertion above them.',
  '  DOES NOT tell you a named surface was SWEPT, or that a mirror list is COMPLETE — an',
  '           UNREGISTERED mirror is invisible here — or what a mirror named only in prose',
  '           refers to. It extracts conservatively and misses `Q1–Q3` past the en dash',
  '           and a lead-less possessive `Q4\'s`; see the header.',
].join('\n');

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
 * The TITLE of a table-form entry: its first two non-empty cells. The whole row
 * stays in `text`, so extraction is unaffected by how the title is built.
 * @param {string} line
 */
function tableRowTitle(line) {
  const cells = line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
    .filter(Boolean);
  return cells.slice(0, 2).join(' \u2014 ');
}

/**
 * Read one spec's Mirrored Surface Checklist entries, IN EITHER FORM.
 *
 *   PROSE-BULLET FORM (older specs): `- [ ]` / `- [x]` opens an entry and every
 *   following non-bullet line belongs to it.
 *
 *   ADR-0031 TABLE FORM (the promote family, extracted 2026-08-30): the table's
 *   DELIMITER row (`|---|---|`) opens the registry, EVERY following pipe row is
 *   ONE entry, and the first non-pipe line closes it. The header row sits above
 *   the delimiter and is therefore never an entry.
 *
 * Fenced code blocks inside the section are skipped whole — the module spec's
 * preamble prints its three derivation greps in one, and nothing in a fence may
 * be read as an entry or as a delimiter.
 *
 * @param {string} file
 * @returns {{title: string, line: number, text: string}[]}
 */
function checklistEntries(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.trim() === CHECKLIST_HEADING);
  if (start === -1) return [];
  const entries = [];
  /** @type {{title: string, line: number, text: string} | null} */
  let cur = null;
  let inTable = false;
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      if (cur) cur.text += '\n' + line;
      continue;
    }
    if (/^#{2,3}\s/.test(line)) break;

    if (inTable) {
      if (/^\s*\|/.test(line)) {
        entries.push({ title: tableRowTitle(line), line: i + 1, text: line });
        continue;
      }
      inTable = false;
    }
    // A delimiter row OPENS the table form. It matches only pipes, dashes,
    // colons and whitespace, and needs at least one dash — no data row can.
    if (/^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(line)) {
      if (cur) {
        entries.push(cur);
        cur = null;
      }
      inTable = true;
      continue;
    }
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
 * Strip review-FINDING ids so one never masquerades as a mirror: "round 5's C4",
 * "round 6's CD-1", "round 4's F-3", "round 3, F2", "round 5's C4 and C5".
 *
 * THE FIRST REGEX IS THE ONE THAT WAS WRONG (fixed 2026-08-30; see the header,
 * with both directions pinned in `tests/unit/mirror-walk.test.js`). It was
 * case-INSENSITIVE with `\d{0,2}`, so its repeating group matched any run of
 * <=3-letter words and ate real row citations past the finding id:
 * `(round 6's CD-1, see row Y4)` became `( )`. It now requires AT LEAST ONE
 * DIGIT, is case-anchored on the id (only `round`/`Round` itself is either
 * case), and continues a run only across an EXPLICIT `and` / `,` connector —
 * so a lowercase word can no longer extend the match.
 *
 * It is narrowed rather than deleted because it still earns its place: a finding
 * id interposed INSIDE a row list ("rows Q9, round 5's C4, and Q10") splits the
 * list for the extractor, and removing the run rejoins it. A bare "round (d)'s A"
 * is no longer stripped, which costs nothing — a letter with no digit is not a
 * row shape and is never extracted.
 *
 * @param {string} text
 */
function stripFindingIds(text) {
  return text
    .replace(
      /[Rr]ound\s+(?:\d+|\([a-zA-Z]\))(?:'s|s'|,)?\s*[A-Z]{1,3}-?\d{1,2}\b(?:\s*(?:and|,)\s*[A-Z]{1,3}-?\d{1,2}\b)*/g,
      ' '
    )
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

  // VACUITY GUARD, applied to EVERY mode before any of them can report success.
  // A run that reached nothing and a run that found nothing wrong are otherwise
  // indistinguishable, and this house treats the deliverable-absent case as a
  // REQUIRED RED for every check: the specs guard every `--test-name-pattern`
  // run with `test -f` because a pattern matching nothing exits 0 with a pass
  // count. Measured before this existed — outside the repo root, a misspelled
  // `--scope`, and (found by the second gate round) `--surface X --scope <typo>`
  // and `--list <missing spec>` — each printed a success and exited 0 over zero
  // entries. BOTH emptinesses are RED: zero FILES read, and zero ENTRIES reached.
  if (files.length === 0 || all.length === 0) {
    console.error(
      `mirror-walk: VACUOUS RUN — read ${files.length} spec file${files.length === 1 ? '' : 's'} ` +
        `and walked ${all.length} checklist entr${all.length === 1 ? 'y' : 'ies'}` +
        `${scope ? ` for scope "${scope}"` : ''}. NOTHING WAS CHECKED, and this is a RED, ` +
        'not a clean verdict. Run it from the repository root, and check the --scope spelling.'
    );
    console.error(REACH);
    process.exit(1);
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
    console.log(`\n${REACH}`);
    process.exit(0);
  }

  // ---- --list <spec> ----
  const listSpec = argOf('--list');
  if (listSpec) {
    const rows = all.filter((x) => x.file === listSpec);
    if (rows.length === 0) {
      console.error(`mirror-walk --list: no Mirrored Surface Checklist entries found in ${listSpec}`);
      process.exit(1);
    }
    for (const a of rows) {
      console.log(`${a.file}:${a.entry.line}  ${a.entry.title.replace(/\s+/g, ' ').slice(0, 110)}`);
      console.log(`    rows:   ${a.refs.rows.join(', ') || '(none)'}`);
      console.log(`    tables: ${a.refs.letters.join(', ') || '(none)'}`);
      console.log(`    specs:  ${a.refs.paths.map((p) => path.basename(p)).join(', ') || '(none)'}`);
    }
    console.log(`\n${REACH}`);
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
    console.log(`\n${REACH}`);
    process.exit(1);
  }
  console.log(
    '\nRESOLVED — every table letter, table-row id and spec path this run EXTRACTED from these\n' +
      'checklists exists in its resolution scope, and the walk was not vacuous.\n'
  );
  console.log(REACH);
  process.exit(0);
}

main();
