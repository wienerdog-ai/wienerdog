'use strict';

/**
 * WP-dot-segment-denial: the class proof.
 *
 * Three independent oracles, per the Deliverables cell: reference equality
 * with Table A row A11's predicate over Table F's seeded full-alphabet
 * sample; Table D's 29 hand-written paths (the handoff closure oracle); and
 * Table E's hand-written boundary matrix. None of the three is derived from
 * any document — Table D and Table E are transcribed by hand from the spec,
 * never parsed out of `docs/instruction-file-inventory.md` or generated.
 *
 * Exactly six top-level tests, titled verbatim per Table C, partitioned so
 * that RED proof `dot-segment-admit-reverted` (C1) reddens exactly T1-T3 and
 * `dot-segment-layout-reverted` (C2) reddens exactly T4-T5. Every assertion
 * carries its test's band marker so each declaration's `signal` is a fixed,
 * matchable substring: `B1 reference`, `B1 boundary`, `B1 handoff`,
 * `B2/B3 reference`, `B2/B3 boundary`, `no over-denial`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { makeAdmit } = require('../../src/core/dream/promote');
const { defaultLayout, readVaultLayout } = require('../../src/core/layout');
const { inferLayout } = require('../../src/core/layout-infer');
const { coerceScalar } = require('../../src/core/frontmatter');

// ---------------------------------------------------------------- REFERENCE
// Table A row A11 — THE REFERENCE PREDICATE, and nothing else. Applied AFTER
// each point's own documented pre-step (its `fold`, or its own coercion/trim).
const fold = (s) => s.normalize('NFC').toLowerCase();
const refSeg = (seg) => [...seg][0] === '.'; // the first CODE POINT is U+002E
const refPath = (rel) => rel.split('/').map(fold).some(refSeg); // B1: after the fold
const refValue = (v) => v.split('/').some(refSeg); // B2/B3: after the documented trims

// ---------------------------------------------------------------- GENERATOR
// Table F: the seeded, full-alphabet, validated-floor sample. INPUT CONTROL 1
// (F4) — an acceptance run draws its OWN seed; a supplied WD_HELD_OUT_SEED is
// refused unless WD_HELD_OUT_REPLAY=1 is also set, and that mode is labelled
// and cannot satisfy criterion 1. INPUT CONTROL 2 (F3) — WD_HELD_OUT_N is a
// validated FLOOR; it may only raise the 1000-per-point minimum.
function readSeedAndN() {
  const supplied = process.env.WD_HELD_OUT_SEED;
  const replay = process.env.WD_HELD_OUT_REPLAY === '1';
  if (supplied && !replay) {
    throw new Error(
      'WD_HELD_OUT_SEED is set. An acceptance run must draw its own seed - a chosen seed can avoid ' +
        'a defect the same command finds unseeded. Re-run with the variable unset, or set ' +
        'WD_HELD_OUT_REPLAY=1 for a labelled reproduction that is NOT acceptance evidence.'
    );
  }
  if (replay && !supplied) {
    throw new Error('WD_HELD_OUT_REPLAY=1 needs WD_HELD_OUT_SEED=<seed> - there is nothing to replay.');
  }
  const seed = supplied || String(Date.now());
  const rawN = process.env.WD_HELD_OUT_N;
  const N = rawN === undefined ? 1000 : Number(rawN);
  if (!Number.isSafeInteger(N) || N < 1000) {
    throw new Error(
      `WD_HELD_OUT_N must be a safe integer >= 1000 (the Table F row F3 floor), got ${JSON.stringify(rawN)}`
    );
  }
  return { seed, replay, N };
}

/** splitmix32, seeded from an FNV-1a hash of the (string) seed. Not a plain LCG —
 * measured at round 2, a plain LCG produced 922/1000 leading dots and only 30 of
 * 112 code points ever first; this mix covers the whole alphabet at ~50%. */
function makeRng(seed) {
  let x = 2166136261;
  for (const ch of String(seed)) x = ((x ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  return () => {
    x = (x + 0x9e3779b9) >>> 0;
    let z = x;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

// Table F row F2 — the alphabet: 112 code points (ASCII printable minus `/`
// and `\`, space, tab, diacritics, CJK, combining marks, astral emoji, and
// four dot look-alikes).
const CP = [];
for (let c = 0x21; c <= 0x7e; c++) {
  if (c === 0x2f || c === 0x5c) continue; // `/` and `\` are separators, not segment characters
  CP.push(String.fromCodePoint(c));
}
CP.push(' ', '\t');
for (const c of [
  'é', 'ß', 'ñ', 'ø', 'å', 'ç', '漢', '字', '日', '本',
  '́', '̈', '․', '．', '·', '。', '\u{1F600}', '\u{1F415}',
]) {
  CP.push(c);
}
// Table F row F6 — B3's alphabet drops the eight characters Win32 forbids in a
// filename, plus tab, because B3's sample must become a real directory.
const WINBAD = new Set(['<', '>', ':', '"', '|', '?', '*', '\t']);
const CPFS = CP.filter((c) => !WINBAD.has(c));

/** A draw over `alphabet`: length 1-64, a leading `.` prepended on ~half of draws. */
function makeDraw(rnd, alphabet) {
  return () => {
    const n = 1 + (rnd() % 64);
    let s = '';
    for (let i = 0; i < n; i++) s += alphabet[rnd() % alphabet.length];
    return rnd() % 2 === 0 ? `.${s}` : s;
  };
}

/** Table F row F5 — the generator is checked before it is trusted. */
function assertDistribution(samples, alphabetSize, marker) {
  const firsts = new Set();
  let dots = 0;
  for (const s of samples) {
    const c = [...s][0];
    firsts.add(c);
    if (c === '.') dots++;
  }
  const share = dots / samples.length;
  assert.ok(
    firsts.size >= Math.min(60, alphabetSize) && share >= 0.35 && share <= 0.65,
    `${marker}: the generator is degenerate - ${firsts.size} distinct first code points of ${alphabetSize}, ` +
      `leading-dot share ${share.toFixed(3)} (want >=60 distinct and 0.35..0.65)`
  );
}

/** @param {string} p */
function tmpDir(p) {
  return fs.mkdtempSync(path.join(os.tmpdir(), p));
}

// ============================================================== T1 (C1)
test('dot-segment-denial B1: makeAdmit equals the reference predicate over a full-alphabet sample', () => {
  const { seed, replay, N } = readSeedAndN();
  console.log(
    `${replay ? 'REPLAY (NOT acceptance evidence) ' : ''}dot-segment-denial B1: seed ${seed}  samples ${N}` +
      `  (reproduce with WD_HELD_OUT_REPLAY=1 WD_HELD_OUT_SEED=${seed})`
  );

  const rnd = makeRng(seed);
  const draw = makeDraw(rnd, CP);
  const samples = [];
  for (let i = 0; i < N; i++) samples.push(draw());
  assertDistribution(samples, CP.length, 'B1 reference');

  const admit = makeAdmit(defaultLayout());
  // The sample is a MIDDLE segment and a BASENAME. A fixed ASCII suffix is
  // appended so no draw can collide with another clause of makeAdmit (a
  // DENIED_SEGMENTS name, an instruction basename, the empty segment); the
  // suffix cannot change the FIRST code point, which is all the reference reads.
  for (const s of samples) {
    for (const rel of [`01-Projects/example/${s}-dir/x.md`, `01-Projects/example/${s}-note.md`]) {
      const impl = admit(rel) !== null;
      const ref = refPath(rel);
      assert.equal(
        impl,
        ref,
        `B1 reference: impl=${impl} ref=${ref} for segment ${JSON.stringify(s)} (rel ${JSON.stringify(rel)})`
      );
    }
  }
});

// ============================================================== T2 (C1)
test('dot-segment-denial B1: the boundary matrix — the U+002E first-character rule at makeAdmit', () => {
  const admit = makeAdmit(defaultLayout());

  // Table E rows E1-E3, hand-written, never generated: the exact `.`, the
  // exact `..`, a dot segment after an empty one, short/ordinary/non-ASCII
  // -tailed/36-char dot-prefixed directory segments, and a dot-prefixed
  // BASENAME (not a directory).
  const refused = [
    '01-Projects/x/./y.md',
    '01-Projects/x/../y.md',
    '01-Projects/x/.a/y.md',
    '01-Projects/x/.vscode/y.md',
    '01-Projects/x/.ordinary/y.md',
    '01-Projects/x/.note.md',
    '01-Projects//.b/x.md',
    '01-Projects/x/.éclair/y.md',
    '01-Projects/x/.abcdefghijklmnopqrstuvwxyz0123456789/y.md',
  ];
  for (const rel of refused) {
    const got = admit(rel);
    assert.ok(got !== null, `B1 boundary: ${JSON.stringify(rel)} must be refused, not admitted`);
    assert.ok(
      got.includes('begins with a dot'),
      `B1 boundary: ${JSON.stringify(rel)} must be refused for the dot-segment reason, got ${JSON.stringify(got)}`
    );
  }

  // Table E row E4 — LEGAL and must stay admitted: interior leading
  // whitespace, both dot look-alikes, a trailing dot, an interior dot, an
  // NFD leading character (decomposed é), a look-alike basename, and a date
  // basename whose interior dot is not a prefix.
  const admitted = [
    '01-Projects/x/ .hi/b.md',
    '01-Projects/x/․hidden/b.md',
    '01-Projects/x/．hidden/b.md',
    '01-Projects/x/ab./b.md',
    '01-Projects/x/a.b/c.md',
    `01-Projects/x/éclair/note.md`,
    '01-Projects/x/․note.md',
    '07-Daily/2026-09-04.md',
  ];
  for (const rel of admitted) {
    const got = admit(rel);
    assert.equal(got, null, `B1 boundary: ${JSON.stringify(rel)} must stay admitted, got ${JSON.stringify(got)}`);
  }
});

// ============================================================== T3 (C1)
test("dot-segment-denial B1: the handoff oracle — Table D's 29 paths, hand-written", () => {
  const DOT = 'begins with a dot';
  const ROOT = 'is a harness instruction-discovery root';
  const EXT = 'content files are promoted';
  const BASE = 'is a harness instruction file';

  // Table D, transcribed by hand from the spec — never parsed out of
  // docs/instruction-file-inventory.md. 17 inventory rows, 29 paths.
  const HANDOFF = [
    ['.github/copilot-instructions.md', DOT],
    ['.github/instructions/NAME.instructions.md', DOT],
    ['.cursor/rules/x.mdc', EXT],
    ['.cursorrules', EXT],
    ['.windsurfrules', EXT],
    ['.windsurf/rules/x.md', DOT],
    ['.devin/rules/x.md', DOT],
    ['.clinerules/x.md', DOT],
    ['.roo/rules/x.md', DOT],
    ['.roorules', EXT],
    ['.continue/rules/x.md', DOT],
    ['.junie/AGENTS.md', BASE],
    ['.junie/playbook.md', DOT],
    ['.junie/rules/x.md', DOT],
    ['.junie/guidelines.md', DOT],
    ['.kiro/steering/x.md', DOT],
    ['.amazonq/rules/x.md', DOT],
    ['.trae/rules/x.md', DOT],
    ['.openhands/microagents/x.md', DOT],
    ['.openhands/skills/x.md', DOT],
    ['.agents/skills/NAME/SKILL.md', DOT],
    ['.qwen/QWEN.local.md', DOT],
    ['.claude/CLAUDE.md', ROOT],
    ['.claude/rules/x.md', ROOT],
    ['.codex/AGENTS.md', ROOT],
    ['.codex/AGENTS.override.md', ROOT],
    ['.rules', EXT],
    ['.goosehints', EXT],
    ['.aider.conf.yml', EXT],
  ];
  assert.equal(HANDOFF.length, 29, 'B1 handoff: the hand-written oracle must hold exactly 29 paths');

  const admit = makeAdmit(defaultLayout());
  const tiers = ['01-Projects/example/', '06-Identity/', '02-Areas/a/b/'];
  for (const [p, reason] of HANDOFF) {
    for (const tier of tiers) {
      const rel = tier + p;
      const got = admit(rel);
      assert.ok(got !== null, `B1 handoff: ${JSON.stringify(rel)} must be refused (expected reason: ${reason})`);
      assert.ok(
        got.includes(reason),
        `B1 handoff: ${JSON.stringify(rel)} refused as ${JSON.stringify(got)}, wanted reason ${JSON.stringify(reason)}`
      );
    }
  }
});

// ============================================================== T4 (C2)
test('dot-segment-denial B2/B3: readVaultLayout and inferLayout equal the reference predicate over a full-alphabet sample', () => {
  const { seed, replay, N } = readSeedAndN();
  console.log(
    `${replay ? 'REPLAY (NOT acceptance evidence) ' : ''}dot-segment-denial B2/B3: seed ${seed}  samples ${N}` +
      `  (reproduce with WD_HELD_OUT_REPLAY=1 WD_HELD_OUT_SEED=${seed})`
  );

  const rnd = makeRng(seed);
  const drawFull = makeDraw(rnd, CP);
  const drawFs = makeDraw(rnd, CPFS);

  const cfgDir = tmpDir('wd-dsd-r-');
  const cfg = path.join(cfgDir, 'config.yaml');
  try {
    // B2 — the reference is applied to the value AFTER the documented
    // coercion (trim, one layer of quotes, an inline ' #' comment) —
    // coerceScalar, the same function the reader uses.
    const b2Samples = [];
    for (let i = 0; i < N; i++) b2Samples.push(drawFull());
    assertDistribution(b2Samples, CP.length, 'B2/B3 reference');
    for (const s of b2Samples) {
      for (const raw of [`${s}-dir`, `a/${s}-dir`]) {
        fs.writeFileSync(cfg, `vault_layout:\n  projects_dir: ${raw}\n`);
        const coerced = coerceScalar(raw).value;
        const impl = readVaultLayout(cfg).projects_dir !== coerced;
        const ref = refValue(coerced);
        assert.equal(
          impl,
          ref,
          `B2/B3 reference: B2 impl=${impl} ref=${ref} for value ${JSON.stringify(coerced)}`
        );
      }
    }

    // B3 — the sample becomes a real directory name (the Win32-forbidden
    // alphabet), so the reference reads pick()'s trimmed form. EVERY producer
    // keyword is cycled, and `reports_dir` is graded on the JOINED value
    // (Table F row F8): inferLayout emits `<picked>/dreams`, not the picked
    // directory alone.
    const KEYS3 = ['projects', 'inbox', 'daily', 'identity', 'skills', 'reports'];
    const b3Samples = [];
    for (let i = 0; i < N; i++) b3Samples.push(drawFs());
    assertDistribution(b3Samples, CPFS.length, 'B2/B3 reference');
    const bvault = tmpDir('wd-dsd-i-');
    try {
      for (let i = 0; i < N; i++) {
        const kw = KEYS3[i % KEYS3.length];
        const name = `${b3Samples[i]}-${kw}`;
        const abs = path.join(bvault, name);
        fs.mkdirSync(abs);
        const trimmed = name.trim();
        const expected = kw === 'reports' ? `${trimmed}/dreams` : trimmed;
        const impl = inferLayout(bvault)[`${kw}_dir`] !== expected;
        const ref = refValue(expected);
        assert.equal(
          impl,
          ref,
          `B2/B3 reference: B3 ${kw}_dir impl=${impl} ref=${ref} for emitted value ${JSON.stringify(expected)}`
        );
        fs.rmSync(abs, { recursive: true, force: true });
      }
    } finally {
      fs.rmSync(bvault, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
  }
});

// ============================================================== T5 (C2)
test('dot-segment-denial B2/B3: the boundary matrix — the U+002E first-character rule at both layout validators', () => {
  const cfgDir = tmpDir('wd-dsd-b-');
  const cfg = path.join(cfgDir, 'config.yaml');
  const readKey = (key, value) => {
    fs.writeFileSync(cfg, `vault_layout:\n  ${key}: ${value}\n`);
    return readVaultLayout(cfg)[key];
  };

  try {
    // Table E row E5 — these three are the values removed from the
    // report-fallback test's case list; their reader-side coverage returns
    // here, asserted as a FALLBACK.
    // Table E row E6 — short/ordinary/non-ASCII-tailed/36-char dot values,
    // an empty-then-dot segment, all fall back.
    // Table E row E7 — the reader trims the WHOLE value first, so two
    // leading spaces then a dot IS a dot value.
    const fallsBack = [
      '.', './reports', 'reports/./dreams', // E5
      'a//.b', '.a', '.vscode', '.ordinary', '.éclair', '.abcdefghijklmnopqrstuvwxyz0123456789', // E6
      '  .hidden', // E7
    ];
    for (const v of fallsBack) {
      const got = readKey('reports_dir', v);
      assert.equal(
        got,
        'reports/dreams',
        `B2/B3 boundary: reports_dir ${JSON.stringify(v)} must fall back to the built-in default, got ${JSON.stringify(got)}`
      );
    }

    // Table E row E8 — LEGAL and returned UNCHANGED: interior leading
    // whitespace, both dot look-alikes, a trailing dot, an interior dot,
    // My.Notes, and an NFD leading character.
    const unchanged = ['a/ .hi/b', '․hidden', '．hidden', 'ab.', 'a.b', 'My.Notes', `éclair`];
    for (const v of unchanged) {
      const got = readKey('projects_dir', v);
      assert.equal(
        got,
        v,
        `B2/B3 boundary: projects_dir ${JSON.stringify(v)} must be returned unchanged, got ${JSON.stringify(got)}`
      );
    }

    // Table E row E9 — a vault whose top-level dirs are all dot-prefixed (one
    // the pick-trim case, one non-ASCII-tailed, one the JOINED reports_dir)
    // emits the built-in defaults for all four.
    const bv = tmpDir('wd-dsd-e9-');
    try {
      for (const d of ['.projects', ' .inbox', '.édaily', '.myreports']) {
        fs.mkdirSync(path.join(bv, d), { recursive: true });
      }
      const bi = inferLayout(bv);
      const defaults = [
        ['projects_dir', '01-Projects'],
        ['inbox_dir', '00-Inbox'],
        ['daily_dir', '07-Daily'],
        ['reports_dir', 'reports/dreams'],
      ];
      for (const [key, want] of defaults) {
        assert.equal(
          bi[key],
          want,
          `B2/B3 boundary: E9 ${key} must fall back to ${JSON.stringify(want)}, got ${JSON.stringify(bi[key])}`
        );
      }
    } finally {
      fs.rmSync(bv, { recursive: true, force: true });
    }

    // Table E row E10 — a vault whose only directory is a dot LOOK-ALIKE
    // emits it UNCHANGED (over-denial, row A10, is forbidden).
    const bv2 = tmpDir('wd-dsd-e10-');
    try {
      fs.mkdirSync(path.join(bv2, '․projects'), { recursive: true });
      const got = inferLayout(bv2).projects_dir;
      assert.equal(
        got,
        '․projects',
        `B2/B3 boundary: E10 the U+2024 look-alike must be returned unchanged, got ${JSON.stringify(got)}`
      );
    } finally {
      fs.rmSync(bv2, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
  }
});

// ============================================================== T6 (neither)
test('dot-segment-denial: no over-denial — dot-free paths and layout values stay admitted and honoured', () => {
  const admit = makeAdmit(defaultLayout());
  const keep = [
    '01-Projects/example/note.md',
    '07-Daily/2026-09-04.md',
    '05-Skills/x/SKILL.md',
    '06-Identity/profile.md',
    'reports/dreams/2026-08-29.md',
    '02-Areas/a/b.c.md',
    '03-Resources/x/y.md',
  ];
  for (const rel of keep) {
    const got = admit(rel);
    assert.equal(got, null, `no over-denial: ${JSON.stringify(rel)} must stay admitted, got ${JSON.stringify(got)}`);
  }

  const cfgDir = tmpDir('wd-dsd-over-');
  const cfg = path.join(cfgDir, 'config.yaml');
  try {
    const values = ['01-Projects', 'reports/dreams', 'My.Notes', 'a.b/c.d', 'YYYY/MM/YYYY-MM-DD.md'];
    for (const v of values) {
      fs.writeFileSync(cfg, `vault_layout:\n  projects_dir: ${v}\n`);
      const got = readVaultLayout(cfg).projects_dir;
      assert.equal(got, v, `no over-denial: projects_dir ${JSON.stringify(v)} must be honoured unchanged, got ${JSON.stringify(got)}`);
    }
  } finally {
    fs.rmSync(cfgDir, { recursive: true, force: true });
  }
});
