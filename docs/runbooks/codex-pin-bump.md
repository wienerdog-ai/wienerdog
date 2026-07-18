# Runbook: Codex pin bump (re-verify the transcript parser)

The Codex transcript parser (`src/core/transcripts/codex.js`, WP-100) fences
tool/external output as untrusted and trusts `message` roles by an explicit
allowlist. That verification is tied to a specific codex-cli version, recorded
in `src/core/supported-codex.js` (`SUPPORTED_CODEX`). This runbook is the
discipline for moving that pin — a maintainer procedure, not a runtime gate.

## 1. When to run

- codex-cli updated on your machine, or
- `checkCodexVersion` (from `src/core/supported-codex.js`) reports a mismatch, or
- before trusting a new Codex release with dream/transcript processing.

## 2. Re-verify tool-output item types

Sample a real, recent rollout file (`~/.codex/sessions/**/*.jsonl`). Confirm
every tool/exec output item type the current codex-cli emits is present in
`TOOL_OUTPUT_TYPES` in `src/core/transcripts/codex.js`
(`custom_tool_call_output` plus the legacy variants). A NEW type that is not
listed would be silently dropped — add it (as `tool_result`, untrusted) and
extend the golden fixture to cover it.

## 3. Rerun the Codex golden fixtures live

Run the Codex transcript tests
(`tests/fixtures/transcripts/codex-rollout.*`, `tests/unit/transcripts.test.js`)
against the sampled real data and confirm the classifications still hold:

- `developer` → trusted `user` context,
- tool output → `tool_result` (untrusted),
- `system` → dropped (never defaulted to trusted).

## 4. Re-affirm the `developer`-role trust decision

Confirm codex-cli still emits `developer`-role messages as its own
control/sandbox scaffolding (NOT tool-derived) before continuing to trust it as
user-authored context. If that has changed, drop `developer` from
`TRUSTED_MESSAGE_ROLES` (fail closed) rather than keeping an unevidenced trust
decision.

## 5. Bump the pin

Set `SUPPORTED_CODEX` in `src/core/supported-codex.js` to the newly-verified
version and commit with a note of exactly what was re-verified (steps 2-4).
