---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen — reference classifier and enforcing sweep (round-6 revision)"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Reference classifier and enforcing sweep (measured, not prescriptive)

Supersedes the round-5 revision of this file. Two things changed after round 6:
the two-trigger attempt predicate (shape + a content-keyed field match inside a
silent twelve-line window) collapsed into ONE structural rule, and the sweep
gained P5/P6 plus a balanced generator.

Evidence, NOT the implementation: the spec fixes the CLASS each input lands in
and the six sweep properties; representation and structure stay the implementer's.

Measured with it: 22 cases covering every input the six review rounds produced,
0 mismatches, 0 moving toward trust — where the previous two-trigger rule got 5
wrong. Sweep: 50,000 balanced inputs, 387 of them RECOGNIZED, correct classifier
green and all SIX mutants RED. The flat generator this replaces produced 0
RECOGNIZED inputs, which would have made P5 and P6 vacuous while showing green.

## Classifier and case corpus (old rule kept alongside, to show what it got wrong)

```js
'use strict';
const { parse } = require('/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/frontmatter');
const { parseNoteResult } = require('/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest');
const SPLIT = new RegExp('\\r\\n|[\\n\\r\\u0085\\u000B\\u000C\\u2028\\u2029]');
const INVIS = /[\p{White_Space}\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;
const FIELD = /^[^\p{L}\p{N}]*derived_from_untrusted[^\p{L}\p{N}]*:/u;
const BRAILLE = '⠀', ZWSP = '​', BOM = '﻿', NBSP = ' ';
const F = 'derived_from_untrusted: true';

// ---- OLD rule (round 5 / HEAD): shape trigger + field trigger with a 12-line window
function oldAttempt(text) {
  const vis = String(text).split(SPLIT);
  const ci = vis.findIndex((l) => l.replace(INVIS, '') !== '');
  if (ci >= 0 && /^-{3,}$/.test(vis[ci].replace(INVIS, ''))) return true;
  const region = vis.slice(0, ci >= 0 ? ci + 12 : 12);
  return region.some((l) => FIELD.test(l.trimStart()));
}
// ---- NEW rule: ONE structural trigger, no field keying, no window.
// A delimiter candidate is a leading line that contains a run of >= 3 hyphens
// and contains no letter and no digit. Invisibles are irrelevant: they are
// neither letters nor digits, so they cannot disqualify a candidate.
function newAttempt(text) {
  const vis = String(text).split(SPLIT);
  const ci = vis.findIndex((l) => l.replace(INVIS, '') !== '');
  if (ci < 0) return false;
  const line = vis[ci];
  return /-{3,}/.test(line) && !/[\p{L}\p{N}]/u.test(line);
}
function recognized(text) {
  const raw = String(text).split('\n');
  if (raw[0] !== '---') return false;
  for (let i = 1; i < raw.length; i++) if (raw[i] === '---') return true;
  return false;
}
const cls = (att) => (t) => recognized(t) ? 'RECOGNIZED' : (att(t) ? 'FAIL-CLOSED' : 'no frontmatter');

// L1's exact construction: U+2800 + --- on line 1, 11 metadata lines, flag on line 13.
const meta = Array.from({ length: 11 }, (_, i) => 'k' + i + ': v').join('\n');
const L1 = BRAILLE + '---\n' + meta + '\n' + F + '\n---\n## Summary\nINJECTED\n';

const cases = {
  'exact + closer':          ['---\n' + F + '\n---\nb\n', 'RECOGNIZED'],
  'exact, near-closer trap': ['---\nid: d\n--- \n' + F + '\n---\nb\n', 'RECOGNIZED'],
  'BOM + ---':               [BOM + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'CRLF block':              ['---\r\n' + F + '\r\n---\r\nb\r\n', 'FAIL-CLOSED'],
  'blank first line':        ['\n---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'leading space':           [' ---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'leading tab':             ['\t---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'no closer':               ['---\n' + F + '\nno close\n', 'FAIL-CLOSED'],
  'trailing space opener':   ['--- \n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'four hyphens':            ['----\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'NBSP + ---':              [NBSP + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'ZWSP + ---':              [ZWSP + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'BRAILLE + ---':           [BRAILLE + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'CR-only block':           [['---', F, '---', 'b'].join('\r') + '\n', 'FAIL-CLOSED'],
  'L1: U+2800, flag line 13':[L1, 'FAIL-CLOSED'],
  'all-blank':               ['\n\n\n', 'no frontmatter'],
  'empty':                   ['', 'no frontmatter'],
  'plain prose':             ['no frontmatter here\n', 'no frontmatter'],
  '---title':                ['---title\n' + F + '\n---\nb\n', 'no frontmatter'],
  'L2: blockquote prose':    ['> derived_from_untrusted: means the trust marker.\nmore\n', 'no frontmatter'],
  'L2: inline-code prose':   ['`derived_from_untrusted`: means the trust marker.\nmore\n', 'no frontmatter'],
  'L2: bullet prose':        ['- derived_from_untrusted: false is required.\nmore\n', 'no frontmatter'],
};

const oldC = cls(oldAttempt), newC = cls(newAttempt);
let oldFail = 0, newFail = 0;
console.log('case                          OLD(HEAD)       NEW             expected');
for (const [k, [t, want]] of Object.entries(cases)) {
  const o = oldC(t), n = newC(t);
  if (o !== want) oldFail++;
  if (n !== want) newFail++;
  const mark = n === want ? '  ' : '! ';
  console.log(mark + k.padEnd(28), o.padEnd(15), n.padEnd(15), want);
}
console.log('\nOLD rule mismatches:', oldFail, '| NEW rule mismatches:', newFail);

console.log('\n--- direction check under the NEW rule (must be 0 toward trust) ---');
let toward = 0;
for (const [k, [t]] of Object.entries(cases)) {
  const p = parse(t);
  if (p.delimited && p.malformed && newC(t) === 'no frontmatter') { toward++; console.log('  !!', k); }
}
console.log('  moves toward trust:', toward);

console.log('\n--- L1 today, for the record ---');
console.log('  digest exclusion =', String(parseNoteResult(L1).exclusion),
  '| bodyInjected =', !!parseNoteResult(L1).note);
```

## Enforcing sweep — six properties, balanced generator, six mutants

```js
'use strict';
const { parse } = require('/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/frontmatter');
const SPLIT = new RegExp('\\r\\n|[\\n\\r\\u0085\\u000B\\u000C\\u2028\\u2029]');
const INVIS = /[\p{White_Space}\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;

function recognized(text) {
  const raw = String(text).split('\n');
  if (raw[0] !== '---') return false;
  for (let i = 1; i < raw.length; i++) if (raw[i] === '---') return true;
  return false;
}
function isAttempt(text) {
  const vis = String(text).split(SPLIT);
  const ci = vis.findIndex((l) => l.replace(INVIS, '') !== '');
  if (ci < 0) return false;
  const line = vis[ci];
  return /-{3,}/.test(line) && !/[\p{L}\p{N}]/u.test(line);
}
function makeClassifier(v) {
  return (t) => {
    if (v === 'missing-branch') return recognized(t) ? 'RECOGNIZED' : 'no frontmatter';
    if (v === 'overbroad')      return recognized(t) ? 'RECOGNIZED' : 'FAIL-CLOSED';
    if (v === 'nonclass')       return recognized(t) ? 'RECOGNIZED' : (isAttempt(t) ? 'WAT' : 'no frontmatter');
    if (v === 'attempt-to-rec') return recognized(t) || isAttempt(t) ? 'RECOGNIZED' : 'no frontmatter';
    if (v === 'rec-to-failed')  return isAttempt(t) || recognized(t) ? 'FAIL-CLOSED' : 'no frontmatter';
    if (v === 'selective-rec')  { const raw = String(t).split('\n');
      if (raw[0] === '---\r') return 'RECOGNIZED';
      return recognized(t) ? 'RECOGNIZED' : (isAttempt(t) ? 'FAIL-CLOSED' : 'no frontmatter'); }
    return recognized(t) ? 'RECOGNIZED' : (isAttempt(t) ? 'FAIL-CLOSED' : 'no frontmatter');
  };
}

const NEL='', VT='', FF='', LS=' ', PS=' ';
function rnd(s0){let s=s0;return()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;}
const PRE = ['', '', '', '﻿', ' ', '\t', '\n', '​', '⠀', ' '];
const OPEN = ['---', '---', '--- ', '----', '---\r', '---title'];
const CLOSE = ['---', '---', '--- ', '---\r'];
const SEPS = ['\n', '\n', '\n', '\r\n', '\r', NEL, VT, FF, LS, PS];
const NOISE = ['x', 'title', '> derived_from_untrusted: prose', '- k: v', '`derived_from_untrusted`: prose'];

// BALANCED generator: half structured blocks (so RECOGNIZED is actually reachable),
// half free-form noise. A generator that never produces a recognized input cannot
// exercise a property about recognized inputs — measured: the flat generator
// produced 0 of 50,000.
function gen(r) {
  if (r() < 0.5) {
    const pre = PRE[Math.floor(r()*PRE.length)], op = OPEN[Math.floor(r()*OPEN.length)];
    const cl = CLOSE[Math.floor(r()*CLOSE.length)], sep = SEPS[Math.floor(r()*SEPS.length)];
    const nf = Math.floor(r()*4);
    const fields = Array.from({length: nf}, (_, j) => j === 0 ? 'derived_from_untrusted: true' : 'k'+j+': v');
    return pre + [op, ...fields, cl, '## Summary', 'BODY'].join(sep);
  }
  const toks = ['-','---','----',' ','\t',' ','﻿','​','⠀','\n','\r\n','\r',NEL,VT,FF,LS,PS,
    'derived_from_untrusted: true','k: v', ...NOISE];
  let t = ''; const len = 1 + Math.floor(r()*10);
  for (let j = 0; j < len; j++) t += toks[Math.floor(r()*toks.length)];
  return t;
}

function sweep(variant, N) {
  const classify = makeClassifier(variant);
  const r = rnd(20260817);
  const v = { P1:0, P2:0, P3:0, P4:0, P5:0, P6:0, recSeen:0 };
  for (let i = 0; i < N; i++) {
    const t = gen(r), c = classify(t);
    const rec = recognized(t), att = isAttempt(t), p = parse(t);
    if (rec) v.recSeen++;
    if (!['RECOGNIZED','FAIL-CLOSED','no frontmatter'].includes(c)) v.P1++;
    if (p.delimited && p.malformed && c === 'no frontmatter') v.P2++;
    if (att && !rec && c === 'no frontmatter') v.P3++;
    if (!att && !rec && c !== 'no frontmatter') v.P4++;
    if ((c === 'RECOGNIZED') !== rec) v.P5++;
    if (att && !rec && c !== 'FAIL-CLOSED') v.P6++;
  }
  return v;
}

const N = 50000;
console.log('variant          recSeen  P1    P2    P3    P4    P5     P6     verdict');
let bad = false;
for (const v of ['correct','missing-branch','overbroad','nonclass','attempt-to-rec','rec-to-failed','selective-rec']) {
  const r = sweep(v, N);
  const red = r.P1||r.P2||r.P3||r.P4||r.P5||r.P6;
  console.log(v.padEnd(16), String(r.recSeen).padEnd(8), String(r.P1).padEnd(5), String(r.P2).padEnd(5),
    String(r.P3).padEnd(5), String(r.P4).padEnd(5), String(r.P5).padEnd(6), String(r.P6).padEnd(6),
    red ? 'RED' : 'green');
  if (v !== 'correct' && !red) { bad = true; console.error('   ^^ MUTANT PASSED'); }
  if (v === 'correct' && red) { bad = true; console.error('   ^^ CORRECT WENT RED'); }
}
process.exitCode = bad ? 1 : 0;
if (!bad) console.log('\ncorrect green, all six mutants RED, and RECOGNIZED inputs are actually generated');
```
