'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const subject = require('../subject/subject.js');

// AN UNGUARDED WRITE INTO THE COPIES' COMMON PARENT. The parent is held at mode
// 0500 for the child's lifetime, so this write FAILS during BASELINE — the
// failure itself is the evidence, not merely the sentinel's absence at RED.
test('fixture parent: writes ../rp-parent-sentinel', () => {
  fs.writeFileSync(path.join(process.cwd(), '..', 'rp-parent-sentinel'), 'phase');
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
