'use strict';
// HOW TO RUN: node docs/specs/logbook/2026-09-17-dream-primary-dialogue-taint-model.js
// Exits 0 when every case in …-taint-model-cases.json matches under reading V2.
//
// A REFERENCE MODEL, NOT THE CONTRACT. Table A of
// docs/specs/WP-dream-primary-dialogue-projection.md is the contract; this is an
// executable transcription of its row A5e, preserved so a later reader can
// reproduce the round-4 comparison instead of trusting a summary of it. Where
// this file and Table A disagree, Table A wins and this file is the bug.
//
// Inert by construction: no dependency, no network, no file write, no process
// spawn. It reads one JSON file beside it and prints. Its name matches none of
// `node --test`'s discovery patterns, so `npm test` does not collect it, and
// `npm run lint` globs docs/**/*.md, so markdownlint does not read it.
//
// Three readings of the prose are kept so the round-4 result stays checkable:
//   V0  the round-3 text: no content-block checks at all
//   V1  + every content block must be an object with a non-empty string `type`
//   V2  + that `type` must be one of the decided block types (row A5c-blocks)
// Round 4 measured 8 / 2 / 0 mismatches. V2 is the shipped contract.

const fs = require('node:fs');
const path = require('node:path');

const CODEX_DECIDED_PAYLOAD_TYPES = new Set([
  'message',
  'custom_tool_call_output', 'function_call_output', 'local_shell_call',
  'web_search_call', 'tool_search_output',
  'reasoning', 'custom_tool_call', 'function_call', 'agent_message',
]);
const CODEX_TOOL_OUTPUT_TYPES = new Set([
  'custom_tool_call_output', 'function_call_output', 'local_shell_call',
  'web_search_call', 'tool_search_output',
]);
const CLAUDE_DECIDED_BLOCK_TYPES = new Set(['text', 'tool_result', 'tool_use', 'thinking', 'image']);
const CODEX_DECIDED_BLOCK_TYPES = new Set(['input_text', 'output_text', 'input_image']);

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nonEmptyStr = (v) => typeof v === 'string' && v.length > 0;

/**
 * Row A5e, step by step.
 * @param {Array<{line?:string, lost?:string}>} events  a transcript, in order;
 *   `lost` is a stream-level loss G1-G4 that never reaches the parser.
 * @param {'claude'|'codex'} harness
 * @param {{blockDiscriminators:boolean, decidedBlockList:boolean}} opts
 * @returns {Array<{role:string, text:string, derived_from_untrusted:boolean}>}
 */
function run(events, harness, opts) {
  let taint = false;              // monotonic: nothing below ever lowers it
  let codexAccepts = null;        // row A4, decided by the first session_meta
  const out = [];

  for (const ev of events) {
    // STEP 1 - the line did not reach the parser intact (row A5a, G1-G4).
    if (ev.lost) { taint = true; continue; }

    let rec;
    try { rec = JSON.parse(ev.line); } catch { taint = true; continue; } // G3
    if (!isObj(rec)) { taint = true; continue; }

    // STEP 2 - both schema checks: the record's own (row A5c) and every
    // content block's (row A5c-blocks). Either failure taints AND suppresses
    // this record entirely - steps 3-5 are not reached.
    let classified = true;
    let blocks = null;
    if (harness === 'claude') {
      if (!nonEmptyStr(rec.type)) classified = false;
      else if (rec.type === 'user' || rec.type === 'assistant') {
        if (!isObj(rec.message)) classified = false;
        else {
          const c = rec.message.content;
          if (rec.type === 'user' && !(typeof c === 'string' || Array.isArray(c))) classified = false;
          else if (rec.type === 'assistant' && !Array.isArray(c)) classified = false;
          else if (Array.isArray(c)) blocks = c;
        }
      } else if (isObj(rec.message) && Array.isArray(rec.message.content)) {
        blocks = rec.message.content; // a DECLINED envelope that still has blocks
      }
    } else {
      if (!nonEmptyStr(rec.type)) classified = false;
      else if (rec.type === 'session_meta') {
        if (!isObj(rec.payload)) classified = false;          // owes no payload.type
      } else if (rec.type === 'response_item') {
        if (!isObj(rec.payload)) classified = false;
        else if (!nonEmptyStr(rec.payload.type) || !CODEX_DECIDED_PAYLOAD_TYPES.has(rec.payload.type)) classified = false;
        else if (rec.payload.type === 'message' && Array.isArray(rec.payload.content)) blocks = rec.payload.content;
      }
      // every other top-level Codex type is declined whole and owes nothing
    }
    if (classified && opts.blockDiscriminators && blocks) {
      const decided = harness === 'claude' ? CLAUDE_DECIDED_BLOCK_TYPES : CODEX_DECIDED_BLOCK_TYPES;
      for (const b of blocks) {
        if (!isObj(b) || !nonEmptyStr(b.type)) { classified = false; break; }
        if (opts.decidedBlockList && !decided.has(b.type)) { classified = false; break; }
      }
    }
    if (!classified) { taint = true; continue; }

    // STEP 3 - recognised tool content anywhere in this record (rows A5d, A5c).
    if (harness === 'claude') {
      if (blocks && blocks.some((b) => isObj(b) && b.type === 'tool_result')) taint = true;
    } else if (rec.type === 'response_item' && CODEX_TOOL_OUTPUT_TYPES.has(rec.payload.type)) {
      taint = true;
    }

    // STEP 4 - does A2 / A3 / A4 accept it as primary dialogue?
    if (harness === 'codex' && rec.type === 'session_meta') {
      if (codexAccepts === null) {
        const ts = rec.payload.thread_source;
        codexAccepts = ts === undefined || ts === 'user';
      }
      continue;
    }
    if (harness === 'codex' && codexAccepts === false) continue;

    let emit = null;
    if (harness === 'claude') {
      if (rec.type === 'user' && rec.isMeta !== true && rec.isSidechain !== true
          && isObj(rec.message) && rec.message.role === 'user') {
        const c = rec.message.content;
        if (typeof c === 'string') emit = { role: 'user', text: c };
        else if (Array.isArray(c)) {
          const t = c.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
          if (t !== '') emit = { role: 'user', text: t };
        }
      } else if (rec.type === 'assistant' && isObj(rec.message) && rec.message.stop_reason === 'end_turn') {
        const t = (rec.message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
        if (t !== '') emit = { role: 'assistant', text: t };
      }
    } else if (rec.type === 'response_item' && rec.payload.type === 'message') {
      const p = rec.payload;
      if (p.role === 'user') {
        const meta = p.internal_chat_message_metadata_passthrough;
        const kinds = isObj(meta) ? meta.content_item_kinds : undefined;
        if (Array.isArray(p.content) && Array.isArray(kinds) && kinds.length === p.content.length) {
          const t = p.content
            .filter((b, i) => b.type === 'input_text' && kinds[i] === 'user.text')
            .map((b) => b.text).join('\n');
          if (t !== '') emit = { role: 'user', text: t };
        }
        // misaligned or absent kinds: A3 DECLINES at step 4. No taint.
      } else if (p.role === 'assistant' && p.phase === 'final_answer' && Array.isArray(p.content)) {
        const t = p.content.filter((b) => b.type === 'output_text').map((b) => b.text).join('\n');
        if (t !== '') emit = { role: 'assistant', text: t };
      }
    }

    // STEP 5 - emit. A user message is false BY ROLE; an assistant message
    // carries the current state (row A5(a) / A5(b)).
    if (emit) {
      emit.derived_from_untrusted = emit.role === 'user' ? false : taint;
      out.push(emit);
    }
  }
  return out; // STEP 6 (G5, an empty extract) has no flags to carry.
}

function lastAssistantFlag(messages) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === 'assistant') return messages[i].derived_from_untrusted;
  }
  return null; // no assistant message was emitted at all
}

const READINGS = [
  ['V0 round-3 prose, no block checks', { blockDiscriminators: false, decidedBlockList: false }],
  ['V1 + block presence and shape', { blockDiscriminators: true, decidedBlockList: false }],
  ['V2 + decided block list (SHIPPED)', { blockDiscriminators: true, decidedBlockList: true }],
];

const cases = JSON.parse(
  fs.readFileSync(path.join(__dirname, '2026-09-17-dream-primary-dialogue-taint-model-cases.json'), 'utf8')
);

let shippedMismatches = null;
for (const [label, opts] of READINGS) {
  let bad = 0;
  console.log(`\n===== ${label} =====`);
  for (const c of cases) {
    const got = lastAssistantFlag(run(c.events, c.harness, opts));
    const ok = got === c.expected;
    if (!ok) bad += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} got=${String(got).padEnd(5)} expected=${String(c.expected).padEnd(5)} | ${c.name}`);
  }
  console.log(`-- mismatches: ${bad} / ${cases.length}`);
  if (opts.decidedBlockList && opts.blockDiscriminators) shippedMismatches = bad;
}

console.log(`\nSHIPPED READING (V2): ${shippedMismatches} mismatches over ${cases.length} cases.`);
process.exit(shippedMismatches === 0 ? 0 : 1);
