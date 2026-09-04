'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
// REQUIRED AT LOAD, so the value this suite asserts on is read BEFORE the plant
// below replaces the file. The plant is the attack the one-copy design carried;
// the assertion stays about the subject.
const subject = require('../subject/subject.js');

// THE CHECK/USE RACE, PLANTED. During its run this suite replaces the mutation
// target — and a PARENT of it — with symlinks pointing into the real checkout.
// A runner that validated once and then wrote into a tree a child had run in
// would follow them out. This runner writes only into a FRESH copy in which no
// child has run, so the plant reaches nothing.
test('fixture plant: replace the mutation target and its parent with symlinks', () => {
  const target = process.env.RP_PLANT_TARGET;
  assert.ok(target, 'RP-SIGNAL-FIXTURE-MISCONFIGURED: the test must name a plant target');
  fs.rmSync(path.join(process.cwd(), 'subject', 'subject.js'), { force: true });
  fs.symlinkSync(target, path.join(process.cwd(), 'subject', 'subject.js'));
  fs.rmSync(path.join(process.cwd(), 'planted-parent'), { recursive: true, force: true });
  fs.symlinkSync(path.dirname(target), path.join(process.cwd(), 'planted-parent'));
  assert.equal(subject.greeting, 'hello', 'RP-SIGNAL-GREETING');
});
