'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const subject = require('../subject/subject.js');

// THE TWO TRAVERSAL REFUSALS, OBSERVED. A directory at mode 0500 is `r-x`: it
// refuses new entries but still permits traversal, so locking the copies' parent
// alone left two channels open (both demonstrated end-to-end at PR #204 round 1)
// — a write INTO a sibling phase copy, and a write into the sandbox ABOVE the
// locked parent. Each is asserted here as a refusal, in every phase.

/** @param {() => void} fn @returns {string} the error code, or '<no error>' */
function codeOf(fn) {
  try {
    fn();
  } catch (e) {
    return String(e && e.code);
  }
  return '<no error>';
}

test('fixture trav: no sibling phase copy exists, and none can be created', () => {
  for (const sibling of ['baseline', 'red', 'control']) {
    const here = path.basename(process.cwd());
    if (sibling === here) continue;
    assert.equal(fs.existsSync(path.join(process.cwd(), '..', sibling)), false,
      `RP-SIGNAL-SIBLING-COPY-PRESENT: ${sibling}`);
  }
  assert.match(codeOf(() => fs.mkdirSync(path.join(process.cwd(), '..', 'rp-sibling'))),
    /EACCES|EPERM|EROFS/, 'RP-SIGNAL-SIBLING-CREATED');
});

test('fixture trav: the sandbox ABOVE the locked parent refuses a write', () => {
  assert.match(codeOf(() => fs.writeFileSync(path.join(process.cwd(), '..', '..', 'rp-counter'), 'x')),
    /EACCES|EPERM|EROFS/, 'RP-SIGNAL-ANCESTOR-WRITABLE');
});

test('fixture trav: the snapshot the copies derive from is read-only', () => {
  const snapshot = path.join(process.cwd(), '..', '..', 'snapshot', 'subject', 'subject.js');
  assert.ok(fs.existsSync(snapshot), 'RP-SIGNAL-FIXTURE-MISCONFIGURED: the snapshot is not where expected');
  assert.match(codeOf(() => fs.appendFileSync(snapshot, '// tampered\n')),
    /EACCES|EPERM|EROFS/, 'RP-SIGNAL-SNAPSHOT-WRITABLE');
});

test('fixture trav: the greeting is hello', () => {
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
