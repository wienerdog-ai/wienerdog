'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const subject = require('../subject/subject.js');

// REGISTRATION DRIFT — the shape a post-RED CONTROL exists to catch, and the one
// an exit-status-only check cannot see. The suite counts its own runs through an
// absolute path the runner does not own (the LANE LIMIT's named residual) and,
// past a threshold the caller sets, either SKIPS its declared test or does not
// register it at all. Either way the process exits 0 having asserted nothing.
let runs = 0;
const counter = process.env.RP_DRIFT_COUNTER;
if (counter) {
  try { runs = Number(fs.readFileSync(counter, 'utf8')) || 0; } catch { runs = 0; }
  runs += 1;
  fs.writeFileSync(counter, String(runs));
}
const drifted = runs >= Number(process.env.RP_DRIFT_AFTER || '3');
const mode = process.env.RP_DRIFT_MODE || 'skip';

// A companion that always runs, so the three drift shapes stay DISTINCT: with it
// present, `skip` is "observed as SKIP" and `omit` is "did not RUN", rather than
// both collapsing into "zero tests ran". `none` drops it too, which is the third
// shape — a file that registers nothing and still exits 0.
if (!(drifted && mode === 'none')) {
  test('fixture drift: the companion always runs', () => {
    assert.ok(true);
  });
}

if (!drifted) {
  test('fixture drift: the greeting is hello', () => {
    assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
  });
} else if (mode === 'skip') {
  test('fixture drift: the greeting is hello', { skip: 'registration drifted' }, () => {
    assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
  });
}
// mode 'omit' and 'none': the declared test is not registered at all, and the
// file still exits 0.
