'use strict';
/**
 * `scripts/mirror-walk.js` — the Mirrored Surface Checklist walker (ADR-0031).
 *
 * Three owner rulings of 2026-08-30 are pinned here, each with BOTH directions
 * wherever a guard decides the outcome:
 *
 *   1. THE NARROWED CLAIM. The tool asserts the reverse index and EXISTENCE of
 *      the names it extracts, and nothing more. Its REACH banner says so in
 *      every mode, and it must never claim line-level resolution.
 *   2. THE VACUITY GUARD. Zero files read or zero entries walked is a RED, in
 *      every mode. The deliverable-absent case is a required RED in this house
 *      — an empty scan and a clean scan are otherwise indistinguishable.
 *   3. BOTH CHECKLIST FORMS. Prose `- [ ]` bullets (older specs) and ADR-0031's
 *      canonical TABLE form (the promote family, extracted 2026-08-30).
 *
 * Plus the `stripFindingIds` regression that routed this file out of PR #32:
 * a real row citation's visibility must not depend on the prose around it.
 *
 * The script is a pure CLI with no exports (house style — see
 * `tests/unit/boundary-check.test.js`), so every case drives it with
 * `execFileSync` over a fixture corpus in a scratch directory. `cwd` is the
 * corpus root, because the script resolves `docs/specs` relative to cwd.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..', '..');
const scriptPath = path.join(repoRoot, 'scripts', 'mirror-walk.js');

/**
 * @param {string[]} args
 * @param {string} cwd
 * @returns {{status: number, stdout: string, stderr: string, all: string}}
 */
function run(args, cwd) {
  try {
    const stdout = execFileSync('node', [scriptPath, ...args], { cwd, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '', all: stdout };
  } catch (err) {
    const stdout = err.stdout || '';
    const stderr = err.stderr || '';
    return { status: err.status, stdout, stderr, all: stdout + stderr };
  }
}

/** A scratch corpus root with `docs/specs/` and `docs/specs/done/`. */
function makeCorpus() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-mirror-walk-'));
  fs.mkdirSync(path.join(root, 'docs', 'specs', 'done'), { recursive: true });
  return root;
}

/** @param {string} root @param {string} name @param {string} body */
function writeSpec(root, name, body) {
  fs.writeFileSync(path.join(root, 'docs', 'specs', name), body);
  return `docs/specs/${name}`;
}

// A spec whose checklist uses the OLD prose-bullet form.
const PROSE_SPEC = [
  '---',
  'id: WP-prose-fixture',
  '---',
  '',
  '## Contract reference',
  '',
  '#### Table G — the gate contract',
  '',
  '| # | Rule |',
  '|---|---|',
  '| G1 | first |',
  '| G2 | second |',
  '| G8 | eighth |',
  '',
  '### Mirrored Surface Checklist',
  '',
  '- [ ] Deliverables `Notes` cells (each cites its owning row or table)',
  '- [x] **The gate return shape** — Table G, and rows G1 and G2 in',
  '      particular; the acceptance criteria mirror them',
  '- [ ] Acceptance criteria that assert row G8',
  '',
  '## Implementation notes & constraints',
  '',
].join('\n');

// A spec whose checklist uses ADR-0031's canonical TABLE form, including a
// fenced block in the preamble (the module spec prints its derivation greps
// in one) that must NOT be read as entries.
const TABLE_SPEC = [
  '---',
  'id: WP-table-fixture',
  '---',
  '',
  '## Contract reference',
  '',
  '#### Table Q — the disposition record',
  '',
  '| # | Rule |',
  '|---|---|',
  '| Q9 | ninth |',
  '| Q10 | tenth |',
  '',
  '#### Table S — the decided bytes',
  '',
  '| # | Rule |',
  '|---|---|',
  '| S3 | third |',
  '',
  '### Mirrored Surface Checklist',
  '',
  '**The table below is the CANONICAL registry.** Counts are DERIVED:',
  '',
  '```',
  '| MS- | this line is inside a fence and is not an entry |',
  '|---|---|',
  'grep -c "^| MS-" docs/specs/WP-table-fixture.md',
  '```',
  '',
  '| # | The contract this row registers | Mirror set | Prohibitions | Walk state |',
  '|---|---|---|---|---|',
  '| MS-01 | Deliverables `Notes` cells defer to the owning table | every `Notes` cell | — | WALKED 2026-08-30 |',
  '| MS-02 | Table S — the decided bytes | `### Exact contracts` and row S3 | — | UNWALKED |',
  '| MS-03 | Table Q — the EP2 result | its criterion asserting rows Q9 and Q10 | — | UNWALKED |',
  '',
  'Fifteen rows remain unwalked and nothing above reaches them.',
  '',
  '## Implementation notes & constraints',
  '',
].join('\n');

// ---------------------------------------------------------------------------
// RULING 2 — the vacuity guard, both directions, in every mode.
// ---------------------------------------------------------------------------

test('vacuity guard: an EMPTY corpus exits RED, never a clean verdict', () => {
  const root = makeCorpus();
  const r = run([], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /VACUOUS RUN/);
  assert.match(r.all, /read 0 spec files and walked 0 checklist entries/);
  assert.doesNotMatch(r.all, /RESOLVED —/);
});

test('vacuity guard: a corpus with NO docs/specs directory at all exits RED', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wd-mirror-walk-bare-'));
  const r = run([], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /VACUOUS RUN/);
});

test('vacuity guard: specs present but NO checklist section exits RED', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-no-checklist.md', '# A spec\n\nNo checklist here.\n');
  const r = run([], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /VACUOUS RUN/);
  assert.match(r.all, /read 1 spec file and walked 0 checklist entries/);
});

test('vacuity guard: a misspelled --scope exits RED and names the scope', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--scope', 'zzz-no-such-spec'], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /VACUOUS RUN/);
  assert.match(r.all, /for scope "zzz-no-such-spec"/);
});

test('vacuity guard: it fires in --surface mode too (a green reverse index over zero entries is the same false green)', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--surface', 'G8', '--scope', 'zzz-no-such-spec'], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /VACUOUS RUN/);
  assert.doesNotMatch(r.all, /is named by 0 Mirrored Surface Checklist/);
});

test('vacuity guard: --list on a spec with no entries exits RED', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--list', 'docs/specs/WP-missing.md'], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /no Mirrored Surface Checklist entries found/);
});

test('vacuity guard: the OTHER direction — a non-empty corpus does NOT fire it and reports its counts', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run([], root);
  assert.equal(r.status, 0);
  assert.doesNotMatch(r.all, /VACUOUS RUN/);
  assert.match(r.all, /3 checklist entries across 1 specs/);
});

// ---------------------------------------------------------------------------
// RULING 3 — both checklist forms parse.
// ---------------------------------------------------------------------------

test('prose-bullet form: one entry per `- [ ]` / `- [x]` bullet, continuation lines included', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--list', 'docs/specs/WP-prose-fixture.md'], root);
  assert.equal(r.status, 0);
  const entryLines = r.stdout.split('\n').filter((l) => l.startsWith('docs/specs/WP-prose-fixture.md:'));
  assert.equal(entryLines.length, 3);
  // The continuation line's `rows G1 and G2` belongs to the bullet above it.
  assert.match(r.stdout, /rows: {3}G1, G2/);
});

test('table form: the delimiter row opens the registry, every pipe row is ONE entry, the blank line closes it', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-table-fixture.md', TABLE_SPEC);
  const r = run(['--list', 'docs/specs/WP-table-fixture.md'], root);
  assert.equal(r.status, 0);
  const entryLines = r.stdout.split('\n').filter((l) => l.startsWith('docs/specs/WP-table-fixture.md:'));
  // Exactly the three MS- rows: not the header row, not the delimiter, not the
  // two contract tables above the section, not the prose line below it.
  assert.equal(entryLines.length, 3);
  assert.match(r.stdout, /MS-01 — Deliverables/);
  assert.match(r.stdout, /MS-02 — Table S/);
  assert.match(r.stdout, /MS-03 — Table Q/);
});

test('table form: a fenced block inside the section is NOT read as entries', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-table-fixture.md', TABLE_SPEC);
  const r = run(['--list', 'docs/specs/WP-table-fixture.md'], root);
  assert.doesNotMatch(r.stdout, /this line is inside a fence/);
});

test('table form: its references resolve — the walk is GREEN over the table form', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-table-fixture.md', TABLE_SPEC);
  const r = run([], root);
  assert.equal(r.status, 0);
  assert.match(r.all, /3 checklist entries across 1 specs/);
  assert.match(r.all, /RESOLVED —/);
});

test('both forms in one corpus are walked together', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  writeSpec(root, 'WP-table-fixture.md', TABLE_SPEC);
  const r = run([], root);
  assert.equal(r.status, 0);
  assert.match(r.all, /6 checklist entries across 2 specs/);
});

test('table form: the shipped promote-module registry parses (the real artifact, not a fixture)', () => {
  const real = path.join(repoRoot, 'docs', 'specs', 'done', 'WP-dream-promote-module.md');
  if (!fs.existsSync(real)) return; // deliverable-absent: nothing to assert
  const r = run(['--list', 'docs/specs/done/WP-dream-promote-module.md'], repoRoot);
  assert.equal(r.status, 0);
  const entryLines = r.stdout
    .split('\n')
    .filter((l) => l.startsWith('docs/specs/done/WP-dream-promote-module.md:'));
  // Its own derivation grep (`grep -c '^| MS-'`) counts 21 rows.
  assert.equal(entryLines.length, 21);
});

// ---------------------------------------------------------------------------
// The reverse index — the half that earned the tool.
// ---------------------------------------------------------------------------

test('--surface: a registered ROW id returns the entries that register it', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--surface', 'G8'], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /row G8 is named by 1 Mirrored Surface Checklist entry/);
  assert.match(r.stdout, /Acceptance criteria that assert row G8/);
  assert.doesNotMatch(r.stdout, /Deliverables `Notes` cells/);
});

test('--surface: a registered TABLE letter returns its entries, over the table form', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-table-fixture.md', TABLE_SPEC);
  const r = run(['--surface', 'Q'], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /Table Q is named by 1 Mirrored Surface Checklist entry/);
  assert.match(r.stdout, /MS-03 — Table Q/);
});

test('--surface: the OTHER direction — an unregistered surface returns none, and is REPORTED not failed', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run(['--surface', 'G1'], root);
  assert.equal(r.status, 0);
  const r2 = run(['--surface', 'Z9'], root);
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /\(none — no checklist registers this surface\)/);
});

// ---------------------------------------------------------------------------
// `stripFindingIds` — the regression that routed this file out of PR #32.
// A reference's visibility must not depend on the prose around it.
// ---------------------------------------------------------------------------

// The reproduction case, verbatim from the gate: under the old regex
// `(round 6's CD-1, see row Y4)` became `( )` and Y4 vanished. A second entry
// interposes a finding id INSIDE a row list, which the old regex ate forward
// from ("C4, and Q10" all gone) and which the strip must still rejoin.
const FINDING_ID_SPEC = [
  '---',
  'id: WP-finding-id-fixture',
  '---',
  '',
  '#### Table Y — the second write',
  '',
  '| # | Rule |',
  '|---|---|',
  '| Y4 | the prohibition |',
  '',
  '#### Table Q — the disposition record',
  '',
  '| # | Rule |',
  '|---|---|',
  '| Q9 | ninth |',
  '| Q10 | tenth |',
  '',
  '#### Table C — the ordering',
  '',
  '| # | Rule |',
  '|---|---|',
  '| C1 | first |',
  '',
  '### Mirrored Surface Checklist',
  '',
  "- [ ] **The prohibition** (round 6's CD-1, see row Y4)",
  "- [ ] **The disposition record** — rows Q9, round 5's C4, and Q10",
  '',
  '## Implementation notes & constraints',
  '',
].join('\n');

test('stripFindingIds: a row id AFTER a finding id survives — `(round 6\'s CD-1, see row Y4)` keeps Y4', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-finding-id-fixture.md', FINDING_ID_SPEC);
  const r = run(['--surface', 'Y4'], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /row Y4 is named by 1 Mirrored Surface Checklist entry/);
  assert.match(r.stdout, /The prohibition/);
});

test('stripFindingIds: the OTHER direction — a finding id INSIDE a row list is still removed, so the row ids on both sides of it survive', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-finding-id-fixture.md', FINDING_ID_SPEC);
  const before = run(['--surface', 'Q9'], root);
  assert.equal(before.status, 0);
  assert.match(before.stdout, /row Q9 is named by 1 Mirrored Surface Checklist entry/);
  // Q10 sits BEHIND the interposed `round 5's C4`. Leave the run in place and
  // the row list is split there and Q10 is lost; eat past it and Y4 is lost.
  const after = run(['--surface', 'Q10'], root);
  assert.equal(after.status, 0);
  assert.match(after.stdout, /row Q10 is named by 1 Mirrored Surface Checklist entry/);
});

test('stripFindingIds: the finding id itself is not reported as a mirror', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-finding-id-fixture.md', FINDING_ID_SPEC);
  const r = run(['--surface', 'C4'], root);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\(none — no checklist registers this surface\)/);
  // And Table C is in scope, so a leaked C4 would have been an UNRESOLVED RED.
  const walk = run([], root);
  assert.equal(walk.status, 0);
  assert.doesNotMatch(walk.all, /names row C4/);
});

// ---------------------------------------------------------------------------
// Resolvability — the failure channel, both directions.
// ---------------------------------------------------------------------------

test('a row id whose table is in scope but lacks the row is UNRESOLVED (RED), and the same corpus with the row is GREEN', () => {
  const red = makeCorpus();
  writeSpec(
    red,
    'WP-red-fixture.md',
    PROSE_SPEC.replace('| G8 | eighth |', '| G3 | third |')
  );
  const r = run([], red);
  assert.equal(r.status, 1);
  assert.match(r.all, /UNRESOLVED — 1:/);
  assert.match(r.all, /names row G8 — Table G is in scope and has no row G8/);

  const green = makeCorpus();
  writeSpec(green, 'WP-green-fixture.md', PROSE_SPEC);
  assert.equal(run([], green).status, 0);
});

test('a `<letter><n>` id whose letter names NO table in scope is SKIPPED and counted, never failed', () => {
  const root = makeCorpus();
  writeSpec(
    root,
    'WP-skip-fixture.md',
    PROSE_SPEC.replace('Acceptance criteria that assert row G8', 'Verification command row V5')
  );
  const r = run(['--skipped'], root);
  assert.equal(r.status, 0);
  assert.match(r.all, /skipped: 1 id whose letter names no table in scope/);
  assert.match(r.all, /V5 \(no Table V in scope — not a table-row citation\)/);
});

test('a named docs/specs path that does not exist is UNRESOLVED (RED)', () => {
  const root = makeCorpus();
  writeSpec(
    root,
    'WP-path-fixture.md',
    PROSE_SPEC.replace(
      'Acceptance criteria that assert row G8',
      'Acceptance criteria that assert row G8, per docs/specs/WP-nowhere.md'
    )
  );
  const r = run([], root);
  assert.equal(r.status, 1);
  assert.match(r.all, /names spec path docs\/specs\/WP-nowhere\.md, which does not exist/);
});

// ---------------------------------------------------------------------------
// RULING 1 — the narrowed claim, stated in the output banner, in every mode.
// ---------------------------------------------------------------------------

for (const [mode, args] of [
  ['default (green)', []],
  ['--surface', ['--surface', 'G8']],
  ['--list', ['--list', 'docs/specs/WP-prose-fixture.md']],
]) {
  test(`REACH banner: ${mode} states the tool's own reach, including that it resolves nothing at LINE level`, () => {
    const root = makeCorpus();
    writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
    const r = run(args, root);
    assert.equal(r.status, 0);
    assert.match(r.all, /REACH — what this run does and does not assert:/);
    assert.match(r.all, /DOES NOT resolve anything at LINE level/);
    assert.match(r.all, /UNREGISTERED mirror is invisible here/);
  });
}

test('REACH banner: it is printed on the RED paths too (vacuous run, and unresolved references)', () => {
  const empty = makeCorpus();
  const vacuous = run([], empty);
  assert.equal(vacuous.status, 1);
  assert.match(vacuous.all, /REACH — what this run does and does not assert:/);

  const red = makeCorpus();
  writeSpec(red, 'WP-red-fixture.md', PROSE_SPEC.replace('| G8 | eighth |', '| G3 | third |'));
  const unresolved = run([], red);
  assert.equal(unresolved.status, 1);
  assert.match(unresolved.all, /REACH — what this run does and does not assert:/);
});

test('the narrowed claim: no run claims to have verified a SWEEP or a COMPLETE mirror list', () => {
  const root = makeCorpus();
  writeSpec(root, 'WP-prose-fixture.md', PROSE_SPEC);
  const r = run([], root);
  assert.equal(r.status, 0);
  // The VERDICT is everything before the REACH banner. The banner names a sweep
  // and completeness only to DISCLAIM them, so the claim check is on the verdict.
  const verdict = r.all.slice(0, r.all.indexOf('REACH —'));
  assert.ok(verdict.length > 0, 'the verdict must precede the REACH banner');
  assert.doesNotMatch(verdict, /every mirror resolves/i);
  assert.doesNotMatch(verdict, /\bswept\b/i);
  assert.doesNotMatch(verdict, /\bcomplete\b/i);
  // The success verdict is scoped to what was EXTRACTED, not to every reference.
  assert.match(verdict, /this run EXTRACTED/);
  // And the banner carries the disclaimers the verdict must not swallow.
  assert.match(r.all, /DOES NOT tell you a named surface was SWEPT/);
});
