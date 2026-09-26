#!/usr/bin/env node
'use strict';
// RE-MEASUREMENT for WP-dream-projection-notification-taint — COUNTS ONLY.
//
//   node docs/specs/logbook/2026-09-27-projection-notification-taint-measure.js [--days N] [--projects DIR] [--strip-origin]
//
// Runs THIS TREE's Claude parser and primary-dialogue projection over the local
// Claude transcripts (default: ~/.claude/projects, every file modified in the
// last N days; N defaults to 5; --days 0 means every file) — the same
// one-directory-level layout `discoverClaude` reads — and reports:
//
//   1. how the `origin` field is distributed over the Claude `user` records
//      that pass row A2's user-half gates (type "user", no isMeta, no
//      isSidechain, message.role "user");
//   2. the task-notification class of Table N row N1 — records passing those
//      gates whose `origin.kind` is exactly "task-notification": how many, the
//      shape of their content, how many the projection emits as a user
//      message, whether its text starts with the `<task-notification` prefix
//      (a boolean — the rule itself never reads text), the taint state BEFORE
//      each one, and the flag each emitted message carries;
//   3. records carrying the label but outside N1 (by reason), so the class's
//      edge is measured rather than assumed;
//   4. the assistant sequence and the whole projected sequence, each as a
//      count, a character total and a SHA-256 digest over role, flag and text,
//      so two runs (two trees, or with and without --strip-origin) can be
//      compared without reading any of it.
//
// --strip-origin deletes the top-level `origin` key from every record before
// the projection sees it: a MEASUREMENT DEVICE for a Claude Code release that
// drops or renames the field. On a tree carrying the rule, its digests must
// equal the shipped tree's (the rule's fail-open property, Table N row N4).
//
// PRIVACY: it prints no transcript text, no path, no session id. A field value
// is printed only if it matches /^[a-z_-]{1,32}$/ (a harness enum); anything
// else prints as "(other)". Text is only ever hashed or counted.
//
// EXIT STATUS: 1 when any N1 record is emitted as a user message flagged
// `false` — the state of every tree WITHOUT the rule, whenever the corpus holds
// a notification; else 0. The last line says which.
//
// It is inert: no dependency, no network, no write; neither `npm test` nor
// `npm run lint` collects it.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const repo = path.resolve(__dirname, '..', '..', '..');
const { parseClaudeTranscript } = require(path.join(repo, 'src/core/transcripts/claude.js'));
const { newRunBudget } = require(path.join(repo, 'src/core/transcripts/stream.js'));
const { createPrimaryProjection } = require(path.join(repo, 'src/core/transcripts/primary-dialogue.js'));

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt;
};
const days = Number(opt('--days', '5'));
const projectsDir = opt('--projects', path.join(os.homedir(), '.claude', 'projects'));
const stripOrigin = args.includes('--strip-origin');
const since = days > 0 ? Date.now() - days * 864e5 : null;

/** @param {*} v @returns {boolean} */
const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** @param {*} v @returns {string} */
const enumOf = (v) => (v === undefined ? 'ABSENT' : typeof v === 'string' && /^[a-z_-]{1,32}$/.test(v) ? v : '(other)');

const files = [];
let dirs = [];
try { dirs = fs.readdirSync(projectsDir, { withFileTypes: true }); } catch { /* none */ }
for (const d of dirs) {
  if (!d.isDirectory()) continue;
  let entries = [];
  try { entries = fs.readdirSync(path.join(projectsDir, d.name), { withFileTypes: true }); } catch { continue; }
  for (const f of entries) {
    if (!f.isFile() || !f.name.endsWith('.jsonl')) continue;
    const p = path.join(projectsDir, d.name, f.name);
    const st = fs.statSync(p);
    if (since === null || st.mtimeMs > since) files.push({ p, size: st.size });
  }
}

const counts = new Map();
const bump = (key) => counts.set(key, (counts.get(key) || 0) + 1);
const versions = new Set();
let userRecords = 0;
let n1Emitted = 0;
let n1EmittedFalse = 0;
const assistant = { count: 0, chars: 0, flaggedTrue: 0, digest: crypto.createHash('sha256') };
const whole = { count: 0, chars: 0, userTrue: 0, digest: crypto.createHash('sha256') };

for (const { p, size } of files) {
  const proj = createPrimaryProjection('claude');
  const observer = {
    lost: () => proj.lost(),
    record: (obj) => {
      if (stripOrigin && isPlainObject(obj)) delete obj.origin;
      const before = proj.messages.length;
      const taintBefore = proj.tainted();
      proj.record(obj);
      const emitted = proj.messages.length > before ? proj.messages[proj.messages.length - 1] : null;
      if (emitted) {
        whole.count += 1;
        whole.chars += emitted.text.length;
        whole.digest.update(`${emitted.role}\u0000${emitted.derived_from_untrusted}\u0000${emitted.text}\u0001`);
        if (emitted.role === 'assistant') {
          assistant.count += 1;
          assistant.chars += emitted.text.length;
          if (emitted.derived_from_untrusted) assistant.flaggedTrue += 1;
          assistant.digest.update(`${emitted.derived_from_untrusted}\u0000${emitted.text}\u0001`);
        } else if (emitted.derived_from_untrusted) {
          whole.userTrue += 1;
        }
      }
      if (!isPlainObject(obj) || obj.type !== 'user') {
        if (isPlainObject(obj) && isPlainObject(obj.origin) && obj.origin.kind === 'task-notification') {
          bump(`LABELLED, outside N1 | top-level type=${enumOf(obj.type)}`);
        }
        return;
      }
      userRecords += 1;
      if (typeof obj.version === 'string' && /^\d+\.\d+\.\d+$/.test(obj.version)) versions.add(obj.version);
      const labelled = isPlainObject(obj.origin) && obj.origin.kind === 'task-notification';
      const gatesPass = obj.isMeta !== true && obj.isSidechain !== true
        && isPlainObject(obj.message) && obj.message.role === 'user';
      if (!gatesPass) {
        if (labelled) {
          const why = obj.isMeta === true ? 'isMeta' : obj.isSidechain === true ? 'isSidechain'
            : !isPlainObject(obj.message) ? 'message not an object' : `message.role=${enumOf(obj.message.role)}`;
          bump(`LABELLED, outside N1 | user record, ${why}`);
        }
        return;
      }
      const origin = obj.origin === undefined ? 'ABSENT'
        : isPlainObject(obj.origin) ? `kind=${enumOf(obj.origin.kind)}` : '(other)';
      bump(`A2-gated user records | origin=${origin}`);
      if (!labelled) {
        // The other direction of the same agreement check, as a count only.
        const c = obj.message.content;
        if (typeof c === 'string' && c.startsWith('<task-notification')) bump('UNLABELLED, text starts <task-notification');
        return;
      }
      const content = obj.message.content;
      const shape = typeof content === 'string' ? 'string'
        : Array.isArray(content) ? (content.some((b) => isPlainObject(b) && b.type === 'tool_result') ? 'array+tool_result' : 'array') : '(other)';
      const out = emitted && emitted.role === 'user' ? `emitted flag=${emitted.derived_from_untrusted}` : 'not emitted';
      // A boolean over a fixed prefix, printed only as true/false: whether the
      // harness label and the text agree. The product rule never reads text.
      const prefix = typeof content === 'string' && content.startsWith('<task-notification');
      bump(`N1 task notifications | content=${shape} | text starts <task-notification=${prefix} | taintBefore=${taintBefore} | ${out}`);
      if (emitted && emitted.role === 'user') {
        n1Emitted += 1;
        if (emitted.derived_from_untrusted === false) n1EmittedFalse += 1;
      }
    },
  };
  parseClaudeTranscript(p, size, newRunBudget(), observer);
}

const sorted = [...versions].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
console.log(`files ${files.length} | user records ${userRecords} | harness versions ${sorted[0] || '-'} .. ${sorted[sorted.length - 1] || '-'}${stripOrigin ? ' | --strip-origin' : ''}`);
for (const key of [...counts.keys()].sort()) console.log(`${String(counts.get(key)).padStart(7)}  ${key}`);
console.log(`assistant messages ${assistant.count} | chars ${assistant.chars} | flagged true ${assistant.flaggedTrue} | sha256 ${assistant.digest.digest('hex').slice(0, 16)}`);
console.log(`all projected messages ${whole.count} | chars ${whole.chars} | user messages flagged true ${whole.userTrue} | sha256 ${whole.digest.digest('hex').slice(0, 16)}`);
if (n1EmittedFalse > 0) {
  console.log(`NOT IN EFFECT: ${n1EmittedFalse} of ${n1Emitted} emitted task notifications read derived_from_untrusted false`);
  process.exitCode = 1;
} else {
  console.log(`in effect: ${n1Emitted} emitted task notifications, none flagged false`);
}
