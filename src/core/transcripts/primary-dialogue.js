'use strict';

// THE PRIMARY-DIALOGUE PROJECTION (WP-dream-primary-dialogue-projection).
//
// A deterministic, code-only projection of one transcript to its PRIMARY
// DIALOGUE: genuine user requests and corrections plus the concluding assistant
// reply of each exchange. Tool calls, tool results, reasoning text and
// intermediate progress replies are not primary dialogue; harness-authored and
// developer-authored instructions are not dialogue at all. There is no model
// call here and no heuristic over message CONTENT — every decision below reads
// structure only (spec Table A).
//
// This module observes the SAME record stream the default parser policy sees,
// in the same order, INCLUDING the stream-level losses that policy never learns
// about. It emits nothing into the default parse: `parseClaudeTranscript` and
// `parseCodexTranscript` called without an observer behave byte-for-byte as
// they did before this package (spec AC5).
//
// Every rule is an ACCEPTANCE ALLOWLIST. Any record, role, block type, phase or
// metadata value not named here supplies NO dialogue — a forbidden list over
// someone else's grammar cannot be closed.

const { TOOL_OUTPUT_TYPES } = require('./codex');

/** Decided Claude content-block types (row A5c-blocks). All five were observed
 *  locally in `message.content`; a block whose `type` is anything else — a
 *  case-shifted `TOOL_RESULT`, a future `redacted_thinking` — makes its record
 *  unclassifiable, because the block `type` is exactly where Claude signals
 *  tool output. Revisit this list when Claude Code adds a block type. */
const CLAUDE_BLOCK_TYPES = new Set(['text', 'tool_result', 'tool_use', 'thinking', 'image']);

/** Decided Codex content-block types (row A5c-blocks), in a `message`
 *  payload's `content`. Revisit at each Codex pin bump — see
 *  docs/runbooks/codex-pin-bump.md. */
const CODEX_BLOCK_TYPES = new Set(['input_text', 'output_text', 'input_image']);

/** Decided Codex `response_item` payload types (row A5c): `message`, the five
 *  tool-output types the default policy already owns, and the four observed
 *  non-tool item types. An unrecognised value here TAINTS rather than declines —
 *  a Codex `payload.type` is where Codex signals tool output, so a renamed
 *  tool-output type must not pass as a positive decline (owner item 4). */
const CODEX_PAYLOAD_TYPES = new Set([
  'message',
  ...TOOL_OUTPUT_TYPES,
  'reasoning',
  'custom_tool_call',
  'function_call',
  'agent_message',
]);

/** @param {*} value @returns {boolean} true for a plain object (never an array, never null) */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** @param {*} value @returns {boolean} */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/** A record whose own schema could not be read: row A5e step 2 taints on it and
 *  suppresses the record entirely. */
const UNCLASSIFIABLE = Object.freeze({ classified: false, blocks: null });
/** A record whose schema WAS readable and that carries no array-valued content. */
const NO_BLOCKS = Object.freeze({ classified: true, blocks: null });

/**
 * Join the `text` of every block whose `type` is exactly `"text"` AND whose
 * `text` is a string.
 *
 * THE STRING CHECK IS LOAD-BEARING TWICE. A non-string `text` is not a text
 * value, so row A2 has nothing to accept and the block is declined — and row
 * A5c-blocks says in terms that "a block whose type is decided but which A2/A3
 * decline never taints", so this is a decline, not a gap. Without the check,
 * `Array.prototype.join` COERCES: `{}` would invent `"[object Object]"`, a
 * number would invent its digits, and an object with a null `toString` THROWS
 * `TypeError: Cannot convert object to primitive value`, aborting a parse the
 * default policy completes. Dialogue is never invented and this never throws.
 * @param {Array<Object>} blocks @param {string} separator @returns {string}
 */
function joinTextBlocks(blocks, separator) {
  return blocks
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(separator);
}

/**
 * Row A5c for Claude: what each recognised top-level type owes, and where its
 * content blocks are. A discriminator is only ever required where the enclosing
 * record's OWN schema has one, so an unfamiliar top-level type is declined
 * whole rather than tainted (row A5c-why) — Claude signals tool output by
 * BLOCK, not by envelope, and that block is still found below.
 * @param {*} obj @returns {{classified:boolean, blocks:Array<Object>|null}}
 */
function claudeShape(obj) {
  if (!isPlainObject(obj) || !isNonEmptyString(obj.type)) return UNCLASSIFIABLE;
  const message = obj.message;
  if (obj.type === 'user' || obj.type === 'assistant') {
    if (!isPlainObject(message)) return UNCLASSIFIABLE;
    const content = message.content;
    if (Array.isArray(content)) return { classified: true, blocks: content };
    // A `user` record owes a string or an array; an `assistant` record an
    // array. Anything else and code cannot tell whether the envelope carried
    // blocks.
    if (obj.type === 'user' && typeof content === 'string') return NO_BLOCKS;
    return UNCLASSIFIABLE;
  }
  // Declined whole — but a DECLINED ENVELOPE IS NOT AN EMPTY ENVELOPE: its
  // blocks are still validated (row A5c-blocks) and still scanned for tool
  // output (row A5d). The scan is bounded to `message.content` at depth one and
  // is deliberately NOT a recursive walk of attacker-controlled JSON.
  if (isPlainObject(message) && Array.isArray(message.content)) {
    return { classified: true, blocks: message.content };
  }
  return NO_BLOCKS;
}

/**
 * Row A5c for Codex. `session_meta` owes no `payload.type` at all — the shipped
 * fixture's header has exactly `id`, `timestamp`, `cwd` — so demanding one
 * would taint every Codex session from its own first line.
 * @param {*} obj @returns {{classified:boolean, blocks:Array<Object>|null}}
 */
function codexShape(obj) {
  if (!isPlainObject(obj) || !isNonEmptyString(obj.type)) return UNCLASSIFIABLE;
  if (obj.type === 'session_meta') {
    return isPlainObject(obj.payload) ? NO_BLOCKS : UNCLASSIFIABLE;
  }
  // Every other top-level Codex type — event_msg, token_usage_record,
  // turn_context, world_state, compacted, … — is declined whole, is never
  // looked inside, and owes no sub-discriminator.
  if (obj.type !== 'response_item') return NO_BLOCKS;
  const payload = obj.payload;
  if (!isPlainObject(payload)) return UNCLASSIFIABLE;
  if (!isNonEmptyString(payload.type) || !CODEX_PAYLOAD_TYPES.has(payload.type)) return UNCLASSIFIABLE;
  if (payload.type !== 'message') return NO_BLOCKS;
  if (!Array.isArray(payload.content)) return UNCLASSIFIABLE; // a `message` payload owes an array
  return { classified: true, blocks: payload.content };
}

/**
 * One transcript's projection state. The caller notifies it of every line the
 * bounded reader delivers — `lost()` for a line that never became a record,
 * `record()` for one that parsed — and reads `messages` when the file is done.
 *
 * The taint state is MONOTONIC: nothing below ever lowers it. A new user
 * request, a dropped exchange, a cap or any later boundary leaves it set.
 *
 * @param {'claude'|'codex'} harness
 * @returns {{lost:()=>void, record:(obj:*)=>void,
 *            messages:Array<{role:'user'|'assistant', text:string, ts:string|null, derived_from_untrusted:boolean}>,
 *            tainted:()=>boolean}}
 */
function createPrimaryProjection(harness) {
  const codex = harness === 'codex';
  /** @type {Array<{role:'user'|'assistant', text:string, ts:string|null, derived_from_untrusted:boolean}>} */
  const messages = [];
  let tainted = false;
  // Row A4, decided by the FIRST session_meta and never revisited. It starts
  // `false`: a rollout supplies primary dialogue only when a first session_meta
  // says so, so a rollout with no readable header yields nothing rather than
  // defaulting to accepted.
  let codexAccepts = false;
  // Whether a first `session_meta` has been ENCOUNTERED — latched before any
  // schema check, so a rollout whose first header is unreadable stays
  // ineligible for the rest of the file whatever a later header says.
  let codexHeaderSeen = false;

  /** Row A5a: a line that did not reach the parser intact (G1-G4). There is no
   *  record to examine, so the only thing code can say is that something was
   *  lost here. @returns {void} */
  const lost = () => {
    tainted = true;
  };

  /** Rows A2 and A4 — what a parsed Claude record supplies, if anything.
   *  @param {Object} obj @returns {{role:'user'|'assistant', text:string, ts:string|null}|null} */
  const acceptClaude = (obj) => {
    if (obj.isSidechain === true) return null; // a subagent's turns are a copy
    const message = obj.message; // step 2 guarantees the shape read below
    const ts = obj.timestamp || null;
    if (obj.type === 'user') {
      if (obj.isMeta === true) return null;
      if (message.role !== 'user') return null;
      const content = message.content;
      if (typeof content === 'string') return { role: 'user', text: content, ts };
      // Array-valued user content: the `text` blocks are the user's own words —
      // the ignore at claude.js:138-155 is exactly what this fixes — and the
      // `tool_result` blocks beside them supply nothing.
      const text = joinTextBlocks(content, '\n\n');
      return text === '' ? null : { role: 'user', text, ts };
    }
    if (obj.type === 'assistant') {
      // The CONCLUDING reply only: `tool_use` is an intermediate progress
      // reply, and an absent stop reason was never observed locally.
      if (message.stop_reason !== 'end_turn') return null;
      const text = joinTextBlocks(message.content, '\n\n');
      return text === '' ? null : { role: 'assistant', text, ts };
    }
    return null;
  };

  /** Rows A3 and A4 — what a parsed Codex record supplies, if anything.
   *  @param {Object} obj @returns {{role:'user'|'assistant', text:string, ts:null}|null} */
  const acceptCodex = (obj) => {
    // Eligibility was decided by the latch below, at the FIRST header; a later
    // header never revisits it.
    if (obj.type === 'session_meta') return null; // a header supplies no dialogue
    if (!codexAccepts || obj.type !== 'response_item') return null;
    const payload = obj.payload;
    if (payload.type !== 'message') return null;
    if (payload.role === 'user') {
      // THE KIND, NOT THE BLOCK TYPE, DECIDES. The harness injects its
      // agents_md / environment / plugins / goal material on `input_text`
      // blocks too, so a rule keyed on the block type alone would readmit
      // exactly the boilerplate this projection exists to remove.
      const meta = payload.internal_chat_message_metadata_passthrough;
      if (!isPlainObject(meta)) return null;
      const kinds = meta.content_item_kinds;
      if (!Array.isArray(kinds) || kinds.length !== payload.content.length) return null;
      const text = payload.content
        // The string check is the same decline as joinTextBlocks': a non-string
        // `text` is no text value, so A3 accepts nothing from this block, and
        // the join neither invents dialogue nor throws.
        .filter((block, i) => block.type === 'input_text' && kinds[i] === 'user.text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
      return text === '' ? null : { role: 'user', text, ts: null };
    }
    if (payload.role === 'assistant' && payload.phase === 'final_answer') {
      const text = payload.content
        .filter((block) => block.type === 'output_text' && typeof block.text === 'string')
        .map((block) => block.text)
        .join('\n');
      return text === '' ? null : { role: 'assistant', text, ts: null };
    }
    return null; // developer, system, any other role, commentary, absent phase
  };

  /** Row A5e steps 2-5, in that order, for one record that parsed.
   *  @param {*} obj @returns {void} */
  const record = (obj) => {
    // ROW A4'S LATCH, AND IT RUNS BEFORE STEP 2 ON PURPOSE. Eligibility belongs
    // to the FIRST `session_meta` record, so encountering one has to be
    // recorded even when its payload cannot be read — otherwise a damaged true
    // header is skipped by step 2's rejection and a LATER header decides
    // instead. That later header may be copied history (a subagent rollout
    // carries the parent's user-role records), which is exactly the second
    // apparent human A4 exists to prevent. Taint alone does not cover it:
    // taint governs assistant text, while user text is `false` by role.
    // Fail closed — an unreadable first header leaves the rollout ineligible
    // for the whole file — and let step 2 taint it as usual.
    if (codex && !codexHeaderSeen && isPlainObject(obj) && obj.type === 'session_meta') {
      codexHeaderSeen = true;
      const payload = obj.payload;
      // `user` is the person's own rollout; an absent key is a harness build
      // with no subagent concept. `subagent` and `guardian_review` are fork
      // mechanisms whose user-role records are the parent's instructions.
      codexAccepts = isPlainObject(payload)
        && (payload.thread_source === undefined || payload.thread_source === 'user');
    }

    // STEP 2 — both schema checks: the one this record's own type owes (row
    // A5c) and a decided-type discriminator on every element of any
    // array-valued content, in this envelope whether it is accepted or
    // declined (row A5c-blocks). Either failure taints AND supplies no
    // dialogue: steps 3-5 are not reached.
    const shape = codex ? codexShape(obj) : claudeShape(obj);
    if (!shape.classified) {
      tainted = true;
      return;
    }
    const blocks = shape.blocks;
    if (blocks !== null) {
      const decided = codex ? CODEX_BLOCK_TYPES : CLAUDE_BLOCK_TYPES;
      for (const block of blocks) {
        if (!isPlainObject(block) || !isNonEmptyString(block.type) || !decided.has(block.type)) {
          tainted = true;
          return;
        }
      }
    }

    // STEP 3 — recognised tool content taints, and execution CONTINUES: one
    // record can both taint and supply dialogue. Because this runs before step
    // 5 emits, an assistant reply sharing a record with tool output is judged
    // against the already-set state. A `tool_use` block does NOT taint — a
    // request to run a tool carries no external content, only its result does.
    if (codex) {
      if (obj.type === 'response_item' && TOOL_OUTPUT_TYPES.has(obj.payload.type)) tainted = true;
    } else if (blocks !== null && blocks.some((block) => block.type === 'tool_result')) {
      tainted = true;
    }

    // STEP 4 — does A2/A3/A4 accept it? A classified-and-declined record never
    // taints. STEP 5 — a user message is `false` BY ROLE, whatever the state
    // is; an assistant message carries the current state.
    const accepted = codex ? acceptCodex(obj) : acceptClaude(obj);
    if (accepted === null) return;
    messages.push({
      role: accepted.role,
      text: accepted.text,
      ts: accepted.ts,
      derived_from_untrusted: accepted.role === 'user' ? false : tainted,
    });
  };

  return { lost, record, messages, tainted: () => tainted };
}

module.exports = { createPrimaryProjection };
