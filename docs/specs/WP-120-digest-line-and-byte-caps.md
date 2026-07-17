---
id: WP-120
title: Enforce digest line + byte caps, bounded note reads and project counts (audit A6)
status: In-Review
model: sonnet
size: S
depends_on: [WP-119]
adrs: [ADR-0004]
branch: wp/120-digest-line-and-byte-caps
---

# WP-120: Enforce digest line + byte caps, bounded note reads and project counts (audit A6)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. Plain Node ≥ 18, **zero runtime deps**, JSDoc types only, no build step.

The **digest** (`~/.wienerdog/state/digest.md`, rendered by `src/core/digest.js`
`renderDigest`) is the pre-rendered session context injected at **every** SessionStart (as
`additionalContext`) and compiled into the `CLAUDE.md`/`AGENTS.md` **managed block**. It is
built from the four injected identity notes, the active-project directory names, and (when
unfrozen) a daily summary, plus fixed control-plane banner lines (alerts, scheduler, update,
identity-exclusion, and — from WP-119 — quarantine).

A 2026-07-15 security audit (action **A6**, deep-dive `07-parsing-dos.md`, finding **F3/F5**)
found that **the claimed "digest ≤ 120 lines" cap is not enforced anywhere in code**. The
`renderDigest` JSDoc literally says "Output is <=120 lines", but the body concatenates
identity notes, project names, and the daily summary with **no line count or byte limit**. A
large `profile.md`/`preferences.md`/`goals.md`/`instructions.md`, or a long project list,
produces an arbitrarily large digest that (a) is injected into every session (cost/latency),
(b) is compiled into the managed block, and (c) makes the SessionStart hook `readFileSync` +
`JSON.stringify` a huge string, undermining its "fast, no computation" contract (F5).

This WP makes the cap real: enforce **both a line cap and a byte cap** on the digest, with
**bounded per-note reads** and a **bounded project count**, deterministic section priority,
and **boundary-safe truncation markers**. It touches only `src/core/digest.js` (a region
disjoint from WP-119's quarantine-banner edit) and its unit test.

**A6 opens NO capability gate.** `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) BLOCKED after this WP. Do not touch `src/core/safety-profile.js`.

## Current state

`src/core/digest.js` `renderDigest(vaultDir, layout, opts)`:

- `parts[]` collects, in this fixed order: the four identity notes (each hash-gated + A4
  provenance-gated + `compact()`ed), then `## Active projects` from
  `listProjectDirs(projects_dir)` (a `- name` per subdir, **no count cap**), then (frozen in
  production) the daily `## Summary`.
- `body = parts.join('\n\n') + '\n'`.
- `prefix` = the control-plane banner lines (identity-exclusion, alerts, scheduler, update;
  WP-119 adds `quarantineLine`), joined and prepended.
- **Returns `prefix ? prefix + '\n\n' + body : body` with NO length/line/byte truncation
  anywhere.** The JSDoc's "Output is <=120 lines" is currently false.
- `compact(body)` trims/collapses a note body but does **not** cap its length.
- `listProjectDirs(dir)` returns ALL immediate subdirectory names, sorted, uncapped.
- The golden `tests/golden/digest-default.md` is produced from small clean fixtures — it is
  well under any reasonable cap, so enforcing caps leaves it **byte-unchanged**.

WP-119 (a dependency) adds an `opts.quarantineLine` control-plane banner to the `prefix`
array, in a region separate from the truncation logic this WP adds. **Land after WP-119.**

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | add `DigestCaps` constants; cap per-note body + project count; enforce line + byte caps on the assembled digest with a boundary-safe marker; fix the JSDoc claim |
| modify | tests/unit/digest.test.js | add: over-line-cap → truncated at a line boundary with the marker; over-byte-cap (a million-char single line) → within the byte cap; project count capped; prefix banners always preserved; clean fixture → golden byte-unchanged |

### Exact contracts

**1. `DigestCaps` constants (top of `digest.js`).** Named so tests import ONE definition.

```js
/** Digest size caps (audit A6, F3/F5). Values OWNER-APPROVED 2026-07-17 — see the spec. */
const DigestCaps = {
  MAX_LINES: 120,             // the historically-claimed line cap, now enforced
  MAX_BYTES: 32 * 1024,       // hard byte ceiling on the injected digest
  MAX_NOTE_BYTES: 8 * 1024,   // per identity note: cap the compacted body before it joins parts[]
  MAX_PROJECTS: 50,           // cap the number of `- name` project lines
  TRUNCATION_MARKER: '> [wienerdog: digest truncated to fit the session-context cap]',
};
```

**2. Bounded per-note read.** In the identity loop, after `const content = compact(r.note.body);`
truncate `content` to at most `MAX_NOTE_BYTES` **at a line boundary** (keep whole lines whose
cumulative byte length fits; append no per-note marker — the overall marker covers it) before
`parts.push(...)`. This bounds any single oversized identity note independently of the total.

**3. Bounded project count.** Cap `listProjectDirs` output to `MAX_PROJECTS` names before
rendering the `## Active projects` block (slice the sorted array; when it was longer, append a
final `- …and N more` line INSIDE the block so the truncation is visible and deterministic).

**4. Line + byte caps on the assembled digest, with a boundary-safe marker.** The
**prefix** (control-plane banners) must ALWAYS survive — a failure/quarantine/identity banner
is exactly what must never be dropped. Apply the caps to the **body**, keeping the full
prefix. Algorithm (deterministic; section priority = the existing `parts[]` order, so
lower-priority trailing sections are dropped first):

```js
// after: const body = `${parts.join('\n\n')}\n`;  and  const prefix = […].join('\n\n');
const assembled = prefix ? `${prefix}\n\n${body}` : body;
return capDigest(assembled, prefix);
```

```js
/**
 * Enforce DigestCaps.MAX_LINES and MAX_BYTES on `assembled`, ALWAYS preserving `prefix`
 * (the control-plane banners) verbatim. Truncation is at a LINE boundary; a single
 * TRUNCATION_MARKER line is appended when anything was dropped. If even prefix+marker
 * exceeds a cap (pathological), keep the prefix + marker (prefix is never dropped). Applies
 * the LINE cap first, then the BYTE cap on the line-capped result (a million-char single
 * line is one line, under MAX_LINES, but blows MAX_BYTES → the byte pass hard-caps it at a
 * UTF-8-safe boundary and appends the marker).
 * @param {string} assembled @param {string} prefix @returns {string}
 */
function capDigest(assembled, prefix) { /* implement per the rules */ }
```

Rules for `capDigest`:
- Split on `\n`. If `lines.length > MAX_LINES`, keep the first `MAX_LINES` lines, drop the
  rest, and append `TRUNCATION_MARKER`.
- Then, if `Buffer.byteLength(result) > MAX_BYTES`, drop trailing lines until it fits, append
  the marker (once), and if a **single** line is itself over the byte budget, hard-cut that
  line at the largest UTF-8-safe byte boundary that fits (never split a multi-byte codepoint
  — slice by chars and re-measure, or use `Buffer` slice + `toString` and trim a trailing
  U+FFFD). The prefix's byte length is reserved first so banners always remain.
- Truncation must never split a multi-byte UTF-8 sequence and never emit a partial JSON-unsafe
  fragment (the SessionStart hook `JSON.stringify`s the whole digest — any byte string is
  safe there, but avoid dangling replacement chars).

**5. Fix the JSDoc.** Change "Output is <=120 lines" to state the enforced caps
("Output is capped to `DigestCaps.MAX_LINES` lines AND `DigestCaps.MAX_BYTES` bytes, with the
control-plane banner prefix always preserved; over-cap content is truncated at a line boundary
with a fixed marker").

## OWNER-APPROVED (2026-07-17) — the cap values

The owner walkthrough ratified **all four recommended values as seeded**
(120 lines / 32 KB / 8 KB per note / 50 projects). The internal consistency
was part of the call: 4 notes × 8 KB + projects + banners sits under the
32 KB ceiling in the typical case, and the ceiling catches the exceptions.
The original recommendations are kept below for the implementer.

- **MAX_LINES — recommend `120`** (makes the long-standing documented claim true). *Alt:*
  raise to `200` if 120 clips a legitimately rich identity in practice.
- **MAX_BYTES — recommend `32 KB`.** Comfortable for a full identity + projects, small enough
  to keep SessionStart fast and the managed block lean. *Alt:* `16 KB` (tighter) / `64 KB`.
- **MAX_NOTE_BYTES — recommend `8 KB` per identity note.** *Alt:* `4 KB` / `16 KB`.
- **MAX_PROJECTS — recommend `50`.** *Alt:* `30` / `100`.

## Implementation notes & constraints

- **The prefix is never truncated.** Alerts, identity-exclusion, quarantine, scheduler, and
  update banners are control-plane safety text — always preserved. Caps apply to the body.
- **`renderDigest` stays pure and total** (never throws; deterministic). The caps are a pure
  post-assembly transform.
- **Golden stays byte-unchanged.** The clean fixtures are well under every cap, so
  `tests/golden/digest-default.md` must NOT change — do NOT update it. If the golden would
  change, the cap logic is wrong (it is firing on in-cap content).
- **Boundary-safe:** truncate on `\n` boundaries; the byte pass must not split a multi-byte
  codepoint. Test with a million-character single line and with multi-byte (e.g. emoji)
  content near the boundary.
- Zero deps, JSDoc only, no build step. When uncertain, choose simpler + record it.

## Security checklist

- [ ] The digest is bounded to `MAX_LINES` AND `MAX_BYTES` for ANY input, including a
      million-character single line and an oversized identity note, so the injected
      session-context / managed block / SessionStart read cannot be inflated without bound.
      The control-plane banner prefix (alerts, identity, quarantine, scheduler, update) is
      always preserved; truncation is at a line boundary and never splits a UTF-8 codepoint.
      No untrusted identifier flows into a path or shell (pure text capping).

## Acceptance criteria

- [ ] A digest whose identity content exceeds `MAX_LINES` lines is truncated to `MAX_LINES`
      (plus the marker line), at a line boundary.
- [ ] A digest containing a single line of ~1,000,000 characters is returned within
      `MAX_BYTES` bytes (byte pass hard-caps it), with the marker, no split codepoint.
- [ ] An identity note whose compacted body exceeds `MAX_NOTE_BYTES` contributes at most
      `MAX_NOTE_BYTES` (line-bounded) to the digest.
- [ ] More than `MAX_PROJECTS` project dirs render at most `MAX_PROJECTS` lines plus a
      deterministic `…and N more` line.
- [ ] With over-cap content AND active banners, ALL banner lines are still present in the
      output (prefix preserved).
- [ ] Clean fixtures → `renderDigest` byte-identical to `tests/golden/digest-default.md`
      (golden unchanged); the JSDoc no longer claims an unenforced 120-line cap.
- [ ] `wienerdog safety` shows all five gates BLOCKED.
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "digest"
npm test
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED
git diff --exit-code tests/golden/digest-default.md && echo "golden unchanged — OK"
```

## Out of scope (do NOT do these)

- The quarantine banner content/opt — **WP-119** (this WP only caps the assembled result,
  preserving that banner in the prefix).
- The transcript parser / ledger / hooks — **WP-118 / WP-119 / WP-121**.
- Re-enabling or changing the frozen daily-summary injection.
- Any change to `tests/golden/digest-default.md`.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/120-digest-line-and-byte-caps`; conventional commits; PR titled
   `feat(digest): enforce line + byte caps, bounded note reads (WP-120)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
