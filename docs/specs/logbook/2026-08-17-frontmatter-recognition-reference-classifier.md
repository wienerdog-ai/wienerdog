---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen — reference classifier and enforcing sweep, as measured"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Reference classifier and enforcing sweep (measured, not prescriptive)

This is the form used to measure the spec's own claims at `2424372`. It is
evidence, NOT the implementation: the spec fixes the CLASS each input lands
in and the four sweep properties, while representation and structure stay the
implementer's. Committed so the spec's reference to it resolves.

Measured with it: 26 accumulated cases, 0 mismatches, 19 moving trusted -> gated
and 0 moving toward trust; 50,000 generated inputs with the correct classifier
green and all four mutants RED.

## Classifier

```js
'use strict';
const { parse } = require('/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/frontmatter');
const NEL='', VT='', FF='', LS=' ', PS=' ';
const BOM='﻿', NBSP=' ', ZWSP='​', BRAILLE='⠀';
const F = 'derived_from_untrusted: true';

// ---- Option (B) reference classifier -------------------------------------
// RECOGNIZED  : line 0 is byte-exactly "---" AND a later line is byte-exactly "---".
//               (identical to today's parse — recognition NEVER widens)
// FAIL-CLOSED : not recognized, but the leading region is a delimiter ATTEMPT.
// R3          : everything else, unchanged.
//
// Trigger 1 (shape): first non-blank leading visual line, with a named
//   over-inclusive invisible/whitespace set removed, is 3+ hyphens.
// Trigger 2 (field): the leading region carries the security field while the
//   file is not RECOGNIZED. Closes the unbounded invisible-character space
//   that trigger 1 cannot (measured: U+2800 is none of Cc/Cf/Cs/DI/White_Space).
const SPLIT = new RegExp('\\r\\n|[\\n\\r\\u0085\\u000B\\u000C\\u2028\\u2029]');
const INVIS = /[\p{White_Space}\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;
const FIELD = /^[^\p{L}\p{N}]*derived_from_untrusted[^\p{L}\p{N}]*:/u;

function classify(text) {
  const raw = String(text).split('\n');
  if (raw[0] === '---') {
    for (let i = 1; i < raw.length; i++) if (raw[i] === '---') return 'RECOGNIZED';
  }
  const vis = String(text).split(SPLIT);
  const ci = vis.findIndex((l) => l.replace(INVIS, '') !== '');
  if (ci >= 0 && /^-{3,}$/.test(vis[ci].replace(INVIS, ''))) return 'FAIL-CLOSED';
  const region = vis.slice(0, ci >= 0 ? ci + 12 : 12);
  if (region.some((l) => FIELD.test(l.replace(INVIS, '').length ? l.trimStart() : l))) return 'FAIL-CLOSED';
  return 'no frontmatter';
}

// ---- every case this review loop accumulated, rounds 1-5 ------------------
const cases = {
  'exact + closer':            ['---\n' + F + '\n---\nb\n', 'RECOGNIZED'],
  'exact, junk line inside':   ['---\nid: d\n--- \n' + F + '\n---\nb\n', 'RECOGNIZED'],
  'BOM + ---':                 [BOM + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'CRLF block':                ['---\r\n' + F + '\r\n---\r\nb\r\n', 'FAIL-CLOSED'],
  'blank first line':          ['\n---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'leading space':             [' ---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'leading tab':               ['\t---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'no closer':                 ['---\n' + F + '\nno close\n', 'FAIL-CLOSED'],
  'trailing space opener':     ['--- \n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'four hyphens':              ['----\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'space-only line then ---':  [' \n---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'NBSP + ---':                [NBSP + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'BOM space BOM + ---':       [BOM + ' ' + BOM + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'ZWSP + ---':                [ZWSP + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'BRAILLE + ---':             [BRAILLE + '---\n' + F + '\n---\nb\n', 'FAIL-CLOSED'],
  'NEL block':                 [['---', F, '---', 'b'].join(NEL) + '\n', 'FAIL-CLOSED'],
  'VT block':                  [['---', F, '---', 'b'].join(VT) + '\n', 'FAIL-CLOSED'],
  'FF block':                  [['---', F, '---', 'b'].join(FF) + '\n', 'FAIL-CLOSED'],
  'CR-only block':             [['---', F, '---', 'b'].join('\r') + '\n', 'FAIL-CLOSED'],
  'LS block':                  [['---', F, '---', 'b'].join(LS) + '\n', 'FAIL-CLOSED'],
  'PS block':                  [['---', F, '---', 'b'].join(PS) + '\n', 'FAIL-CLOSED'],
  'all-blank':                 ['\n\n\n', 'no frontmatter'],
  'empty':                     ['', 'no frontmatter'],
  'plain prose':               ['no frontmatter here\n', 'no frontmatter'],
  'asterisk break':            ['***\nsome text\n---\nb\n', 'no frontmatter'],
  'prose with a dash run':     ['A title\n\n---\n\nmore prose\n', 'no frontmatter'],
};

let fail = 0;
console.log('case                          got             expected');
for (const [k, [text, want]] of Object.entries(cases)) {
  const got = classify(text);
  const ok = got === want;
  if (!ok) fail++;
  console.log((ok ? '  ' : '! ') + k.padEnd(28), got.padEnd(15), want);
}
console.log('\nmismatches:', fail);

console.log('\n--- what changes vs today, per case ---');
let toGated = 0, toTrusted = 0;
for (const [k, [text]] of Object.entries(cases)) {
  const t = parse(text);
  const todayTrusted = !(t.delimited && t.malformed) && !(t.delimited && !t.malformed && false);
  const todayClass = t.delimited ? (t.malformed ? 'malformed' : 'recognized') : 'no-frontmatter(trusted)';
  const now = classify(text);
  if (todayClass === 'no-frontmatter(trusted)' && now === 'FAIL-CLOSED') { toGated++; console.log('  trusted -> gated :', k); }
  if (todayClass === 'malformed' && now === 'no frontmatter') { toTrusted++; console.log('  !! malformed -> trusted :', k); }
}
console.log('  moves toward gating:', toGated, '| moves toward trust:', toTrusted, '(must be 0)');
```

## Enforcing sweep with its four mutants

```js
'use strict';
const { parse } = require('/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/frontmatter');
const SPLIT = new RegExp('\\r\\n|[\\n\\r\\u0085\\u000B\\u000C\\u2028\\u2029]');
const INVIS = /[\p{White_Space}\p{Cc}\p{Cf}\p{Cs}\p{Default_Ignorable_Code_Point}]/gu;
const FIELD = /^[^\p{L}\p{N}]*derived_from_untrusted[^\p{L}\p{N}]*:/u;

function leading(text) {
  const vis = String(text).split(SPLIT);
  const ci = vis.findIndex((l) => l.replace(INVIS, '') !== '');
  return { vis, ci, region: vis.slice(0, ci >= 0 ? ci + 12 : 12) };
}
function isAttempt(text) {
  const { vis, ci, region } = leading(text);
  if (ci >= 0 && /^-{3,}$/.test(vis[ci].replace(INVIS, ''))) return true;
  return region.some((l) => FIELD.test(l.trimStart()));
}
function recognized(text) {
  const raw = String(text).split('\n');
  if (raw[0] !== '---') return false;
  for (let i = 1; i < raw.length; i++) if (raw[i] === '---') return true;
  return false;
}
// The classifier under test (variant lets us mutate it).
function makeClassifier(variant) {
  return function classify(text) {
    if (variant === 'missing-branch') { return recognized(text) ? 'RECOGNIZED' : 'no frontmatter'; }
    if (variant === 'leak') { return recognized(text) ? 'RECOGNIZED' : 'no frontmatter'; }
    if (variant === 'overbroad') { return recognized(text) ? 'RECOGNIZED' : 'FAIL-CLOSED'; }
    if (variant === 'nonclass') { return recognized(text) ? 'RECOGNIZED' : (isAttempt(text) ? 'WAT' : 'no frontmatter'); }
    return recognized(text) ? 'RECOGNIZED' : (isAttempt(text) ? 'FAIL-CLOSED' : 'no frontmatter');
  };
}

const NEL='', VT='', FF='', LS=' ', PS=' ';
const ALPH = ['-','---','----',' ','\t',' ','﻿','​','⠀','\n','\r\n','\r',
  NEL,VT,FF,LS,PS,'derived_from_untrusted: true','k: v','x','title'];
function rnd(seed){let s=seed;return()=>(s=(s*1103515245+12345)&0x7fffffff)/0x7fffffff;}

function sweep(variant, N) {
  const classify = makeClassifier(variant);
  const r = rnd(20260817);
  const v = { total: 0, notTotal: 0, towardTrust: 0, attemptToR3: 0, r3NotPreserved: 0 };
  for (let i = 0; i < N; i++) {
    let t = ''; const len = 1 + Math.floor(r() * 10);
    for (let j = 0; j < len; j++) t += ALPH[Math.floor(r() * ALPH.length)];
    const c = classify(t); v.total++;
    // P1 totality
    if (!['RECOGNIZED','FAIL-CLOSED','no frontmatter'].includes(c)) v.notTotal++;
    // P2 direction: nothing gated today may become trusted
    const p = parse(t);
    const gatedToday = p.delimited && p.malformed;
    if (gatedToday && c === 'no frontmatter') v.towardTrust++;
    // P3 no delimiter attempt reaches R3
    if (isAttempt(t) && c === 'no frontmatter') v.attemptToR3++;
    // P4 conservation: a non-attempt, non-recognized input must stay exactly as today
    if (!isAttempt(t) && !recognized(t) && c !== 'no frontmatter') v.r3NotPreserved++;
  }
  return v;
}

const N = 50000;
console.log('variant          total  !total  towardTrust  attempt->R3  R3-not-preserved  VERDICT');
let anyGreenMutant = false;
for (const variant of ['correct', 'missing-branch', 'leak', 'overbroad', 'nonclass']) {
  const v = sweep(variant, N);
  const red = v.notTotal || v.towardTrust || v.attemptToR3 || v.r3NotPreserved;
  console.log(variant.padEnd(16), String(v.total).padEnd(6),
    String(v.notTotal).padEnd(7), String(v.towardTrust).padEnd(12),
    String(v.attemptToR3).padEnd(12), String(v.r3NotPreserved).padEnd(17),
    red ? 'RED' : 'green');
  if (variant !== 'correct' && !red) anyGreenMutant = true;
  if (variant === 'correct' && red) { console.error('CORRECT VARIANT WENT RED'); process.exitCode = 1; }
}
if (anyGreenMutant) { console.error('\nA MUTANT PASSED — the sweep is not enforcing'); process.exitCode = 1; }
else console.log('\nevery mutant goes RED and the correct classifier goes green; exit code reflects it');
```
