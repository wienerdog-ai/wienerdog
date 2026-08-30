'use strict';

// Audit A4 differential gate: the digest-side strict parser and the dream
// validator must give the SAME trust classification to every byte form of the
// security field — "no byte sequence is accepted as trusted at commit and
// interpreted differently by the digest" (ADR-0022).

const test = require('node:test');
const assert = require('node:assert/strict');

const { parse, readBool } = require('../../src/core/frontmatter');
const { parseFrontmatter } = require('../../src/core/dream/validate');

// Values that must classify as trusted on BOTH sides: exactly the forms that
// normalize to the boolean `false` (exact + whitespace-padded — the separator
// and trailing-trim restore parity with the old validator's `:\s*` + trim).
// Everything else (padded `true` included, since it normalizes to exact `true`)
// is not-trusted on both sides.
const CORPUS = ['false', 'true', 'True', 'TRUE', 'False', '"true"', "'false'",
  ' true', ' false', 'false ', 'true ', 'true # note', 'no', '0', '1', 'yes',
  'FALSE', '', 'false\r', 'true\r'];
const TRUSTED = new Set(['false', ' false', 'false ', 'false\r']);

/** @param {string} noteText @returns {boolean} digest-side: trusted iff provably false */
function digestTrusts(noteText) {
  return readBool(parse(noteText).fields, 'derived_from_untrusted') === false;
}

/** @param {string} noteText @returns {boolean} validator-side: trusted iff boolean false */
function validatorTrusts(noteText) {
  return parseFrontmatter(noteText).derived_from_untrusted === false;
}

test('digest and validator agree on the trust classification of every corpus byte form', () => {
  for (const v of CORPUS) {
    const noteText = `---\nderived_from_untrusted: ${v}\n---\nbody`;
    const d = digestTrusts(noteText);
    const val = validatorTrusts(noteText);
    assert.equal(d, val, `digest and validator disagree on ${JSON.stringify(v)}`);
    assert.equal(d, TRUSTED.has(v), `unexpected classification for ${JSON.stringify(v)}`);
  }
});

test('a no-separator-space line agrees on both sides', () => {
  const trusted = '---\nderived_from_untrusted:false\n---\nbody';
  assert.equal(digestTrusts(trusted), true);
  assert.equal(validatorTrusts(trusted), true);
  const untrusted = '---\nderived_from_untrusted:true\n---\nbody';
  assert.equal(digestTrusts(untrusted), false);
  assert.equal(validatorTrusts(untrusted), false);
});

// ─── malformed blocks (WP-validator-decided-bytes, AC4) ──────────────────────
//
// The corpus above varies the VALUE of the security field inside a well-formed
// block, so nothing in it made `parse` report `malformed` and the ADR's other
// half — "a malformed block excludes the note unconditionally", the same bytes
// classified the same way on both sides — went unexercised.
//
// The digest side is the exported classifier `parseNoteResult`. The validator
// side is its Tier-3 DECISION, run — asserting a property of the parser instead
// would not be the decision.
//
// RE-POINTED at the extracted Tier-3 gate (WP-dream-promote-in-workspace, row
// G7). It used to run end to end through `validateAndCommit` on a real vault,
// because the validator exported no per-file decision: an accept was a file that
// survived into the commit, a refusal was a revert. That function is retired —
// under promotion nothing is written to the vault, so there is nothing to revert
// — and the Tier-3 decision it ran inline is now `makeGates().tier3`, an
// exported per-file decision taking the candidate bytes. So this side asserts
// the SAME decision, one indirection closer, with no temp repo in between: a
// refusal is a reason string, an accept is `null`.

const { parseNoteResult } = require('../../src/core/digest');
const { makeGates } = require('../../src/core/dream/validate');
const { defaultLayout } = require('../../src/core/layout');

// One floor-passing, trusted block per rule that sets `malformed` — so the only
// ground on which either side may refuse is the malformed-ness itself.
const FLOOR = 'confidence: 0.9\nrecurrence: 5\nderived_from_untrusted: false\n';
const MALFORMED = {
  'junk-line': `---\n${FLOOR}junk line\n---\nb\n`,
  'indented-line': `---\n${FLOOR}  indented: x\n---\nb\n`,
  'duplicate-key': `---\n${FLOOR}tag: a\ntag: b\n---\nb\n`,
};
// The same blocks with the offending line removed: the non-vacuity control.
const WELL_FORMED = { control: `---\n${FLOOR}---\nb\n` };

/** A throwaway vault git repo holding `notes`, run through the real validator.
 *  @param {Record<string,string>} notes  vault-relative path → bytes
 *  @returns {{reverted:{path:string,reason:string}[], tracked:(rel:string)=>boolean}} */
function validatorVerdict(notes) {
  const layout = defaultLayout();
  const { tier3 } = makeGates({});
  /** @type {{path:string, reason:string}[]} */
  const reverted = [];
  /** @type {Set<string>} the paths the gate ADMITS — what "reaches the commit" means now */
  const admitted = new Set();
  for (const [rel, text] of Object.entries(notes)) {
    const reason = tier3({ rel, candidateBytes: Buffer.from(text, 'utf8'), layout });
    if (reason) reverted.push({ path: rel, reason });
    else admitted.add(rel);
  }
  return { reverted, tracked: (rel) => admitted.has(rel) };
}

test('a malformed block is refused by the digest classifier AND by the validator Tier-3 decision', () => {
  const notes = Object.fromEntries(Object.keys(MALFORMED).map((k) => [`06-Identity/${k}.md`, MALFORMED[k]]));
  const v = validatorVerdict(notes);
  for (const [name, text] of Object.entries(MALFORMED)) {
    const rel = `06-Identity/${name}.md`;
    assert.equal(parse(text).malformed, true, `${name} is not malformed`);
    // Digest side.
    assert.deepEqual(parseNoteResult(text), { note: null, exclusion: 'malformed' }, `digest kept ${name}`);
    // Validator side — the decision, run.
    const r = v.reverted.find((x) => x.path === rel);
    assert.ok(r, `validator kept ${name} the digest excludes`);
    assert.equal(v.tracked(rel), false, `${name} reached the commit`);
  }
});

test('non-vacuity: the same block WITHOUT the offending line is accepted on both sides', () => {
  const notes = Object.fromEntries(Object.keys(WELL_FORMED).map((k) => [`06-Identity/${k}.md`, WELL_FORMED[k]]));
  const v = validatorVerdict(notes);
  for (const [name, text] of Object.entries(WELL_FORMED)) {
    const rel = `06-Identity/${name}.md`;
    assert.equal(parse(text).malformed, false);
    assert.equal(parseNoteResult(text).exclusion, null, `digest excluded ${name}`);
    assert.equal(v.reverted.find((x) => x.path === rel), undefined, `validator reverted ${name}`);
    assert.equal(v.tracked(rel), true, `${name} did not reach the commit`);
  }
});
