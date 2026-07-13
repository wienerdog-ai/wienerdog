---
id: WP-100
title: Codex transcript parser — recognize the current tool-output item type and fail-closed role classification
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
branch: wp/100-codex-tool-output-and-fail-closed-roles
---

# WP-100: Codex tool-output recognition + fail-closed roles

## Context (read this, nothing else)

Wienerdog reads AI-CLI session **transcripts** (Claude JSONL, Codex rollout
files) and consolidates them into a markdown memory vault during the nightly
**dream** run. A parser turns each transcript into an **Extract**: a normalized
list of `messages`, each `{role, text, ts}` where `role` is one of
`'user' | 'assistant' | 'tool_result'`.

The `role` field is a **security boundary**, not a cosmetic label. The threat
model (T1 — persistent prompt injection via memory) treats **user-authored text
as trusted** and **tool-result content as untrusted**. Downstream, every dream
candidate is tagged `derived_from_untrusted: true` when its supporting text came
from `role: 'tool_result'` messages; Tier-3 destinations (identity, skills, the
injected session digest) are **closed to untrusted-derived content**. So a
message the parser emits as `role: 'tool_result'` is fenced off from the highest-
trust memory; a message emitted as `role: 'user'` is eligible for it. Mislabeling
tool output as `user` is a T1 provenance bypass; dropping tool output entirely is
a completeness gap that also means the untrusted-tagging path never fires.

Two verified defects exist in the Codex parser (`src/core/transcripts/codex.js`),
confirmed against real `codex-cli 0.144.1` rollout data and upstream
`openai/codex` source (memo `memory/research/2026-07-13-codex-transcript-role-provenance.md`):

1. **Stale tool-output recognition.** `mapCodexItem` only recognizes
   `function_call_output` as tool output. But codex-cli 0.144.x emits tool/exec
   output as **`custom_tool_call_output`** (with `function_call_output` /
   `local_shell_call` / `web_search_call` / `tool_search_output` as
   legacy/alternate variants). In real sampled sessions **~18% of all
   response items** (every tool/exec output) is therefore silently DROPPED — the
   dream never sees it, and the Codex `derived_from_untrusted` tagging path
   **never fires in practice**.
2. **Default-trust role classification.** The `message` branch does
   `role === 'assistant' ? 'assistant' : 'user'` — i.e. *trust everything that is
   not literally `assistant`*. Codex's upstream `Message.role` is an **untyped
   `String`** with no schema enforcement, so if the protocol ever routes tool /
   external content through a `message` item under a novel role string (a future
   MCP passthrough, a `"tool"` role convention, a provider bug), it is silently
   absorbed as **trusted `user` text** — the exact T1 bypass, latent today
   because tool output currently never rides in a `message` item.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004) —
this WP changes a pure parsing function and its tests; it starts nothing, adds no
dependency. Fail-closed beats fail-open on a T1 surface: an unrecognized role
must be **dropped**, never defaulted to trusted.

## Current state

`src/core/transcripts/codex.js` — `mapCodexItem` (the ONLY function this WP
changes) and its exports:

```js
/**
 * Map one response_item payload to a message, or null if it produces none.
 * Isolated so M4 (WP-010) can correct field names cheaply against a live
 * Codex CLI machine — this shape is UNVERIFIED against real output.
 * @param {Object} payload
 * @returns {{role:'user'|'assistant'|'tool_result', text:string, ts:null}|null}
 */
function mapCodexItem(payload) {
  if (!payload) return null;
  if (payload.type === 'message') {
    const role = payload.role === 'assistant' ? 'assistant' : 'user';
    const content = Array.isArray(payload.content) ? payload.content : [];
    const text = content
      .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
      .map((block) => block.text)
      .join('\n');
    return { role, text, ts: null };
  }
  if (payload.type === 'function_call_output') {
    return { role: 'tool_result', text: payload.output, ts: null };
  }
  return null;
}

module.exports = { discoverCodex, parseCodexTranscript, mapCodexItem };
```

`parseCodexTranscript` calls `mapCodexItem(obj.payload)` for each
`type === 'response_item'` line and pushes non-null results into `messages`.
That call site is **unchanged** by this WP.

**Reference — how the Claude parser classifies (the pattern to match).**
`src/core/transcripts/claude.js` classifies untrusted content by a **positive
marker**, not by role elimination: a user-message block is emitted as
`role: 'tool_result'` **only** when `block.type === 'tool_result'` is explicitly
present; plain-string user content is trusted `role: 'user'`; array blocks that
match no handled type are **silently skipped (dropped), not defaulted to
trusted**. Codex must adopt the same fail-closed posture: recognize tool output
by explicit item type → `tool_result`; trust `message` text only for an explicit
role allowlist; drop anything else.

**Redaction / capping (downstream, unchanged, shown for the golden fixture).**
After `mapCodexItem`, `src/core/transcripts/index.js` redacts secret-looking
substrings and applies size caps. Relevant here: the string
`password=hunter2secret1234567` becomes `password=[REDACTED:generic-secret]`.
The golden `.expected.json` reflects the **post-redaction** text.

**Extract `messages` role type** (`src/core/transcripts/index.js`):
`Array<{role:'user'|'assistant'|'tool_result', text:string, ts:string|null}>`.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/transcripts/codex.js | Rewrite `mapCodexItem` per the Exact contract: (a) `message` branch uses an explicit trusted-role ALLOWLIST of EXACTLY {`user`, `developer`} → user (`assistant`→assistant); `system` AND any other/absent role → `null`/drop, NEVER default-trust; (b) recognize the tool-output item types (`custom_tool_call_output` primary + `function_call_output`/`local_shell_call`/`web_search_call`/`tool_search_output`) → `role:'tool_result'`; (c) replace the stale "UNVERIFIED / re-verify at M4 (WP-010)" comments (lines ~48–52 and ~74) with a citation of memo `memory/research/2026-07-13-codex-transcript-role-provenance.md`. NO change to `discoverCodex` or `parseCodexTranscript`. |
| modify | tests/unit/transcripts.test.js | Add direct `mapCodexItem` acceptance tests (all 8 cases below). |
| modify | tests/fixtures/transcripts/codex-rollout.jsonl | Add three response_item lines (a `custom_tool_call_output`, a `developer` message, and a `system` message that must be DROPPED) — golden update EXPLICITLY authorized by this WP. |
| modify | tests/fixtures/transcripts/codex-rollout.expected.json | Reflect the new lines (developer→user, custom_tool_call_output→tool_result, `system`→dropped) — golden update EXPLICITLY authorized by this WP. |
| modify | docs/THREAT-MODEL.md | Add the T1 note recorded under "THREAT-MODEL addition" below. |

### Exact contracts

Rewrite `mapCodexItem` (and add two small pure helpers in the same file) to
exactly this:

```js
// Trusted `message` roles — EXACTLY {user, developer}. `user` = the user's own
// prompts; `developer` = Codex-authored control/sandbox scaffolding (confirmed in
// real codex-cli 0.144.1 rollout data — NOT tool-derived). FAIL CLOSED: any other
// role — INCLUDING `system` — is DROPPED, never defaulted to trusted `user`,
// because the upstream Message.role is an untyped String with no schema
// enforcement. `system` is harness/control-plane instruction text, not
// user-authored memory content the dream needs; dropping it loses nothing
// valuable and avoids an unevidenced trust decision.
// (memo 2026-07-13-codex-transcript-role-provenance)
const TRUSTED_MESSAGE_ROLES = new Set(['user', 'developer']);

// Tool/external-output item types → UNTRUSTED (role 'tool_result'). Primary on
// codex-cli 0.144.x: custom_tool_call_output. Legacy/alternate variants:
// function_call_output, local_shell_call, web_search_call, tool_search_output.
// Each is a distinct response_item `type`, never a `message`.
const TOOL_OUTPUT_TYPES = new Set([
  'custom_tool_call_output',
  'function_call_output',
  'local_shell_call',
  'web_search_call',
  'tool_search_output',
]);

/** Join a message item's input_text/output_text content blocks. */
function extractMessageText(payload) {
  const content = Array.isArray(payload.content) ? payload.content : [];
  return content
    .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
    .map((block) => block.text)
    .join('\n');
}

/** Best-effort text from a tool-output item across the known shapes. Returns ''
 *  when no known field is present — the item is STILL emitted as tool_result
 *  (untrusted), never dropped or trusted. */
function extractToolOutputText(payload) {
  if (typeof payload.output === 'string') return payload.output;                    // legacy function_call_output
  if (payload.output && typeof payload.output.content === 'string') return payload.output.content; // FunctionCallOutputPayload struct
  if (Array.isArray(payload.content)) {                                             // observed custom_tool_call_output 0.144.x
    return payload.content
      .filter((block) => block && (block.type === 'input_text' || block.type === 'output_text'))
      .map((block) => block.text)
      .join('\n');
  }
  return ''; // unverified variant field shape — tagged tool_result regardless
}

/**
 * Map one response_item payload to a message, or null if it produces none.
 * Verified against codex-cli 0.144.1 + upstream openai/codex source
 * (memo memory/research/2026-07-13-codex-transcript-role-provenance.md).
 * @param {Object} payload
 * @returns {{role:'user'|'assistant'|'tool_result', text:string, ts:null}|null}
 */
function mapCodexItem(payload) {
  if (!payload) return null;
  if (payload.type === 'message') {
    if (payload.role === 'assistant') {
      return { role: 'assistant', text: extractMessageText(payload), ts: null };
    }
    if (TRUSTED_MESSAGE_ROLES.has(payload.role)) {
      return { role: 'user', text: extractMessageText(payload), ts: null };
    }
    return null; // FAIL CLOSED: unknown/absent role → drop, never trust
  }
  if (TOOL_OUTPUT_TYPES.has(payload.type)) {
    return { role: 'tool_result', text: extractToolOutputText(payload), ts: null };
  }
  return null;
}
```

Keep `module.exports = { discoverCodex, parseCodexTranscript, mapCodexItem };`
(`mapCodexItem` is already exported and is the acceptance-test entry point).

**Acceptance test cases (direct `mapCodexItem` unit tests).** Input → output:

| # | Input `payload` | Expected result |
|---|---|---|
| 1 | `{type:'custom_tool_call_output', call_id:'c1', name:'exec', content:[{type:'input_text', text:'exec stdout: 3 files'}]}` | `{role:'tool_result', text:'exec stdout: 3 files', ts:null}` |
| 2 | `{type:'function_call_output', output:'file bytes'}` | `{role:'tool_result', text:'file bytes', ts:null}` (legacy still works) |
| 3 | `{type:'message', role:'developer', content:[{type:'input_text', text:'sandbox read-only'}]}` | `{role:'user', text:'sandbox read-only', ts:null}` |
| 4 | `{type:'message', role:'system', content:[{type:'input_text', text:'sys'}]}` | `null` (FAIL CLOSED — `system` is control-plane text, NOT trusted; dropped) |
| 5 | `{type:'message', role:'tool', content:[{type:'input_text', text:'MUST DROP'}]}` | `null` (FAIL CLOSED — unrecognized role) |
| 6 | `{type:'message', role:'user', content:[{type:'input_text', text:'hi'}]}` | `{role:'user', text:'hi', ts:null}` (unchanged) |
| 7 | `{type:'message', role:'assistant', content:[{type:'output_text', text:'yo'}]}` | `{role:'assistant', text:'yo', ts:null}` (unchanged) |
| 8 | `{type:'local_shell_call', status:'completed', action:{}}` (source-only variant — output field shape UNobserved) | assert ONLY `result.role === 'tool_result'` (RECOGNIZED as untrusted); do NOT assert a specific `text` — its field shape is unverified, so text may be `''` |

Case 8 is deliberately recognition-only: for the source-only variants
(`local_shell_call`/`web_search_call`/`tool_search_output`) the invariant is
"**recognized as `tool_result` (untrusted)**", NOT a specific extracted text. Do
not fabricate an `output` field for them. The verified `custom_tool_call_output`
(case 1, real-data shape) is the one that asserts extracted text.

**Golden fixture extension.** Insert these three lines into
`tests/fixtures/transcripts/codex-rollout.jsonl` **immediately after** the
existing `function_call_output` line and **before** the `event_msg` line:

```jsonl
{"type":"response_item","payload":{"type":"message","role":"developer","content":[{"type":"input_text","text":"Filesystem sandboxing is read-only."}]}}
{"type":"response_item","payload":{"type":"custom_tool_call_output","call_id":"call_1","name":"exec","content":[{"type":"input_text","text":"exec stdout: 3 files"}]}}
{"type":"response_item","payload":{"type":"message","role":"system","content":[{"type":"input_text","text":"MUST-DROP control-plane text"}]}}
```

The resulting `tests/fixtures/transcripts/codex-rollout.expected.json` `messages`
array (post-redaction, in on-disk order) is exactly:

```json
"messages": [
  { "role": "user", "text": "List my TODOs", "ts": null },
  { "role": "assistant", "text": "Here are your TODOs.", "ts": null },
  { "role": "tool_result", "text": "file contents: password=[REDACTED:generic-secret]", "ts": null },
  { "role": "user", "text": "Filesystem sandboxing is read-only.", "ts": null },
  { "role": "tool_result", "text": "exec stdout: 3 files", "ts": null }
]
```

(The `role:'system'` message is DROPPED — it is absent from `messages`. The other
top-level fields of `codex-rollout.expected.json` — `harness`, `session_id`,
`started`, `cwd`, `truncated` — are unchanged.)

### THREAT-MODEL addition (docs/THREAT-MODEL.md)

Under **T1 — Persistent prompt injection via memory**, in the **Mitigations**
list, append this bullet immediately after the existing "Provenance tracking at
capture" bullet:

> - **Parser-level provenance dependency (Codex).** The `derived_from_untrusted`
>   tagging above is only correct if each transcript parser (a) recognizes the
>   harness's *current* tool-output item type and routes it to `role:'tool_result'`,
>   and (b) classifies `message` roles by an explicit **trusted-role allowlist**,
>   dropping any unrecognized role rather than defaulting it to trusted `user`.
>   For Codex this is load-bearing because upstream `Message.role` is an **untyped
>   string** with no schema enforcement (verified against codex-cli 0.144.1 and
>   `openai/codex` source, WP-100 / memo 2026-07-13): a future protocol change
>   that routed tool/external content through a novel `message` role would
>   otherwise be silently absorbed as trusted user text. **Residual (accepted):**
>   a Codex CLI version bump can rename or add tool-output item types; the golden
>   fixture (WP-100) catches a drop of the *known* types in CI, but a genuinely
>   new type must be re-verified on the next Codex pin bump.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- **`system` is NOT trusted — it is dropped** (Codex spec-review decision). The
  trusted allowlist is EXACTLY {`user`, `developer`}. `system`-role items are
  harness/control-plane instruction text, not user-authored memory content the
  dream needs — dropping them loses nothing valuable and removes an unevidenced
  trust decision (the real 0.144.1 rollout sample never required trusting
  `system`). Fail-closed: a dropped `system` message is never mis-trusted.
- The unverified variants (`local_shell_call`, `web_search_call`,
  `tool_search_output`) were read from upstream source only, not observed in real
  sampled sessions; their exact output-text field is **not confirmed**. That is
  why `extractToolOutputText` is best-effort and always returns a `tool_result`
  entry even on empty text — recognizing the item as untrusted output is the
  security-critical property; perfect text extraction is not. Do NOT special-case
  these beyond the shared helper, and do NOT fabricate an `output` field for them
  in tests — the acceptance test for these variants asserts ONLY
  `role === 'tool_result'` (recognition), never a specific extracted text.
- Do NOT capture the tool *invocation* items (`custom_tool_call` / `function_call`)
  — those are the model's own actions, out of scope here (see Out of scope).
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR. Do NOT expand scope.

## Security checklist

- [ ] Tool/external output is classified UNTRUSTED (`role:'tool_result'`) by
      explicit item-type match, never trusted.
- [ ] `message` text is trusted ONLY for the exact allowlist {`user`, `developer`}
      (plus `assistant`→assistant); any other/absent role — INCLUDING `system` —
      is DROPPED (returns `null`), never defaulted to trusted `user`, so the parser
      fails closed if the Codex protocol changes.
- [ ] No transcript content flows into a filesystem path or shell command in this
      WP (pure in-memory parsing) — the path-traversal checklist item is N/A.

## Acceptance criteria

- [ ] All 8 direct `mapCodexItem` cases in the table above pass.
- [ ] The extended Codex golden fixture parses to exactly the `messages` array
      shown (developer→user, custom_tool_call_output→tool_result, `system`-role
      dropped, existing three entries unchanged).
- [ ] The existing legacy `function_call_output` golden entry still parses to a
      `tool_result` (no regression).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "Codex|mapCodexItem|transcript"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Capturing tool *invocation* items (`custom_tool_call`, `function_call`) — a
  separate completeness enhancement, not this security/coverage fix.
- Changing `discoverCodex` or `parseCodexTranscript` control flow.
- The Claude parser (`claude.js`) — referenced only as the pattern to match.
- Any new ADR — this is a verified bug fix + defense-in-depth consistent with the
  existing T1 model, not a new architectural decision.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/100-codex-tool-output-and-fail-closed-roles`; conventional commits;
   PR titled `fix(transcripts): recognize Codex tool-output items and fail closed on unknown roles (WP-100)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
</content>
</invoke>

## Done record (2026-07-13)

Merged to main as `bf3c9c2` (PR #101, squash). Post-audit wd-researcher check that found a real bug: `mapCodexItem` was silently dropping ~18% of Codex content (unrecognized tool-output item types) and defaulting unknown roles. Rewrote it to a fail-closed allowlist (`TRUSTED_MESSAGE_ROLES = {user, developer}`; `system`/unknown → dropped) and to recognize `custom_tool_call_output` + 4 variants → `role:'tool_result'` (untrusted), so Codex tool output drives `derived_from_untrusted` exactly like Claude. THREAT-MODEL T1 gained a parser-level provenance note. Double gate: wd-reviewer APPROVE + Codex clean; CI green. Shipped in v0.8.0.
