'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const subject = require('../subject/subject.js');

// A SUITE THAT DRIFTS RED FOR A REASON THE MUTATION DID NOT CAUSE. It counts its
// own runs through an ABSOLUTE path the runner does not own — the residual the
// REACH footer names as outside the lane — and starts failing past a limit the
// caller sets. BASELINE and RED are green on that count; the post-RED CONTROL is
// not, which is exactly the counterfactual a reused BASELINE green cannot make.
let runs = 0;
const counter = process.env.RP_COUNTER_FILE;
if (counter) {
  try { runs = Number(fs.readFileSync(counter, 'utf8')) || 0; } catch { runs = 0; }
  runs += 1;
  fs.writeFileSync(counter, String(runs));
}

test('fixture ambient: the greeting is hello', () => {
  const limit = Number(process.env.RP_AMBIENT_LIMIT || '99');
  assert.ok(runs <= limit, 'RP-SIGNAL-AMBIENT-DRIFT');
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
