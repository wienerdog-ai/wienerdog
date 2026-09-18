---
date: 2026-09-18
related_wps: [WP-dream-collect-parse-throw-quarantine, WP-transcript-parsers-harden-text-values]
---

# Correction to the parse-throw quarantine's fixture prediction (2026-09-18)

`docs/specs/done/WP-dream-collect-parse-throw-quarantine.md` is a filed record
and is not edited. Its Implementation notes predicted that hardening the
transcript parsers would make **both** of its crafted fixtures stop throwing,
and therefore that both the tests built on them would need retargeting. That
prediction is wrong in one particular, and this entry records the correction
where the next reader of the filed spec can find it.

Measured on `wp/transcript-parsers-harden-text-values`, branched from `main` at
`423a0f9e`, by applying the four filter conjuncts of
`WP-transcript-parsers-harden-text-values` Table A rows A1–A4 and running
`node --test --test-name-pattern='\[PT-' tests/unit/dream-collect.test.js`:

- **Three tests break, not four or two:** `[PT-1]`, `[PT-4]` and `[PT-6]`. All
  three build their crafted candidate from
  `tests/fixtures/dream/transcripts/codex-poisoned-text-block.jsonl`, whose
  every poisoned value is a content block's `text`. Once the four joins decline
  a non-string `text`, that file parses cleanly and is **admitted** rather than
  set aside, so each test's `reason === 'parse-threw'` assertion fails.
- **`[PT-3]` does NOT break.** Its fixture,
  `codex-poisoned-session-id.jsonl`, carries a non-string
  `session_meta.payload.id` and no poisoned `text` at all. It parsed cleanly
  before the hardening too, and still throws afterwards — later, at
  `sanitize(extract.session_id)` during the scratch-filename derivation. The
  hardening is not on that path, and the metadata fields are explicitly out of
  scope for it. `[PT-3]` passes before and after.
- **There is no `[PT-5]`.** The shipped suite is `[PT-1]`, `[PT-2]`, `[PT-3]`,
  `[PT-4]`, `[PT-6]`, `[PT-7]`, `[PT-8]` — seven tests, with `[PT-5]` absent
  from the tree. `WP-transcript-parsers-harden-text-values` Table C row C1 and
  its acceptance criterion 5 both name `[PT-5]` among the tests that must keep
  passing untouched; that clause is vacuous rather than wrong.

The consequence for the three broken tests is settled by
`WP-transcript-parsers-harden-text-values` Table C: they are retargeted onto the
parse-seam mock `[PT-2]` already uses, keeping their names, corpora and
assertions, so that the throw arrives from **inside** the parse call and
`pt-only-parse-is-caught`'s isolation — `[PT-3]` and only `[PT-3]` — survives.
Hand-applying all four declarations in
`tests/red-proofs/dream-collect-parse-throw.proofs.json` after the retarget
reproduces each one's declared `expectRed` set exactly.
