---
id: WP-digest-line-cap-raise
title: Raise the digest line cap so a real identity set is no longer truncated
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004]
epic: digest-delivery
---

# WP-digest-line-cap-raise: Raise the digest line cap so a real identity set is no longer truncated

> **Archived 2026-08-30, post-merge.** Shipped in PR #45 (`efca39c`; implementation
> `ad2a050`, review findings 1+2 in `f3dbf6f`), after wd-reviewer APPROVE. The
> spec text below carries **four dated errata**, folded in during this archive
> pass so the record matches what shipped. In document order:
>
> 1. **Contract 1** (line ~154) — the mandated `DigestCaps` comment said
>    "re-approved at its current value", false next to a 120 → 400 change.
>    Corrected here; **the shipped source still carries the original phrasing**,
>    left open deliberately as product code.
> 2. **Contract 4** (line ~264) — the measured byte figure was `25,055`,
>    measured without the malformed daily note the test is named for. It is
>    `25,159`.
> 3. **Contract 4** (line ~307) — the exact-edit list named one byte-figure
>    comment; the rescale falsifies **two**. Both are named now.
> 4. **Contract 5** (line ~342) — the fixture used 160 items against a `> 200`
>    line assertion, and 160 items renders 199 lines. The shipped test uses 170.
>
> Errata 2–4 are all one root cause: **a number was derived by arithmetic and
> never rendered once.** The acceptance criteria caught all three at
> implementation time, which is the loop working — but each cost a review round
> that a single `node -e` render while drafting would have saved.

## Context (read this, nothing else)

Wienerdog gives a user's AI a memory made of files. The **digest** is the
pre-rendered session-context file `~/.wienerdog/state/digest.md` — identity notes
plus active context — that is injected into every new Claude Code / Codex CLI
session. It is rendered deterministically (no model calls) by `renderDigest` in
`src/core/digest.js` from the user's vault: `06-Identity/profile.md`,
`preferences.md`, `goals.md`, `instructions.md`, the project list, and the newest
daily note's summary. **Wienerdog is just files** — this WP adds no process, no
daemon, no telemetry (ADR-0004).

The rendered digest is bounded by two caps in `DigestCaps` so a runaway vault can
never blow up a session's context window: a **line** cap (`MAX_LINES`) and a
**byte** cap (`MAX_BYTES`). `capDigest` applies the line cap first, then the byte
cap to the line-capped result; anything dropped is marked with a single
`TRUNCATION_MARKER` line. The control-plane *prefix* (the warning banners about
failed jobs, quarantined transcripts, available updates) is always preserved
verbatim — the body absorbs all truncation.

**The bug: the line cap, not the byte cap, is what actually truncates real
users.** `MAX_LINES` is 120 and `MAX_BYTES` is 32 KB. Identity notes are prose —
short lines. On the maintainer's live vault, measured 2026-08-30, the uncapped
digest body is **205 lines / 10,675 bytes** — about 52 bytes per line. The line
cap cuts it at line 120, which lands mid-`## Preferences`: the entire `## Goals`
section and the entire `## Standing instructions` section — the highest-value,
most explicitly-authored identity content there is — never reach the session. The
byte cap was nowhere near binding on that content.

**The owner's decision (2026-08-30): raise `MAX_LINES`; do not remove it.**
`MAX_BYTES` stays at 32 KB and remains the primary cap. The line cap stays as a
secondary guard against a pathological shape the byte cap cannot catch — e.g. a
vault whose identity notes are thousands of near-empty lines, which stays under
32 KB while being useless as session context.

## Current state

`src/core/digest.js` lines 23–31 (verbatim, as on `main` = `0410e3a`,
2026-08-30). **`src/core/digest.js` is byte-unchanged by the `quarantine-surface`
landings** — the decay work went into `src/core/dream/ledger.js` — so every
`digest.js` citation below is stable:

```js
/** Digest size caps (audit A6, F3/F5). Values OWNER-APPROVED 2026-07-17 — see the spec. */
const DigestCaps = {
  MAX_LINES: 120, // the historically-claimed line cap, now enforced
  MAX_BYTES: 32 * 1024, // hard byte ceiling on the injected digest
  MAX_NOTE_BYTES: 8 * 1024, // per identity note: cap the compacted body before it joins parts[]
  MAX_PROJECTS: 50, // cap the number of `- name` project lines
  MAX_DAILY_READ_BYTES: 64 * 1024, // bounded read of the daily note before parse (A6 parity for vault notes)
  TRUNCATION_MARKER: '> [wienerdog: digest truncated to fit the session-context cap]',
};
```

`DigestCaps` is exported (`src/core/digest.js` line 871, in the `module.exports`
block that opens at line 865) and every consumer —
`capDigest` and the tests — reads `DigestCaps.MAX_LINES` rather than restating
`120`. **No golden fixture contains a line count**: `tests/golden/digest-default.md`
is 45 lines, far below any cap, and is byte-unaffected by this change (verified by
running the suite with the raised value — see "Measured blast radius").

`capDigest` (`src/core/digest.js` lines 576–602 — moved by the fork's digest
work, but **byte-identical** to its upstream body) reserves the prefix's lines
before giving the body a budget:

```js
const prefixLineCount = prefix ? prefix.split('\n').length + 1 : 0;
const lineBudget = Math.max(0, DigestCaps.MAX_LINES - prefixLineCount);
```

**Measured blast radius — re-measured on `main` = `0410e3a`, after the
`quarantine-surface` epic landed.** With `MAX_LINES` set to `400` on an otherwise
clean tree, `npm test` reported `tests 2239 / pass 2225 / fail 5`. Four of the
five are this change; all four are in `tests/unit/digest.test.js`, and each fails
because a fixture or an assertion was written against the literal `120`:

| test (line on fork `main`) | failing assertion | why it fails at a raised cap |
|---|---|---|
| `renderDigest truncates over-MAX_LINES content at a line boundary with the marker` (line 431) | `last line is the marker` | generates 200 `- item N` lines; 200 < 400, so nothing truncates |
| `with over-cap content AND active banners, all banner lines are still present (prefix preserved)` (line 535) | `truncation marker present` | generates 300 `- item N` lines; 300 < 400, same reason |
| `AC4 — the banner template and cap constants are unchanged; entries keep their order` (line 1314) | `cap constants unchanged` | asserts `DigestCaps.MAX_LINES === 120` **literally** |
| `AC4 — under cap pressure WITH a daily entry, both caps hold and the marker is retained` (line 1329) | `the existing truncation marker is retained` | its fixture (4 notes × 60 lines × ~410 bytes) is trimmed to ~80 lines by the 8 KB per-note cap and tops out at ~31.4 KiB — under both raised caps, so nothing truncates and no marker is emitted |

**The last two did not exist upstream.** They arrived with the fork's
alert-callout / daily-framing work and are the reason this WP's blast radius had
to be measured here rather than ported.

**The failing SET is unchanged by the `quarantine-surface` landings — proven, not
assumed.** `WP-quarantine-banner-decay` rewrote exactly three
`quarantineLine` string literals in this same file (diff hunks at `@@ -181` and
`@@ -1098`; net `+11/-8`), which shifted all four tests above by exactly **+3
lines** (428→431, 532→535, 1311→1314, 1326→1329) and changed nothing else. Both
hunks sit inside `quarantineLine`-passthrough tests, not inside any cap-bound
test, and the re-run sweep returned the identical four ids. Total test count grew
2143 → 2239 (+96) from the epic; the failing set did not.

(The fifth failure, `tests/integration/adopt-e2e.test.js`, reproduces identically
on an unmodified `main` — a pre-existing, machine-local pinned-`claude`-path
failure — and is **not** in this WP's scope.)

**Neither `capDigest` nor any other cap mechanism changed on the fork.**
`capDigest`'s body is byte-identical to upstream's; only its line number moved
(373 → 576). The fork's digest changes (per-line daily framing, alert-callout
neutralization, project display-name sanitization, frontmatter-recognition
fail-open) touch what goes *into* the prefix and body, never how the caps trim
them — verified by diffing the function. One of those changes is load-bearing
context for the note on prefix pressure below: `formatAlerts` now routes all four
alert fields through `renderAlertField`, which caps each at `MAX_FIELD_CHARS`
(2,000, imported from `src/core/alerts.js:29`) and substitutes `ALERT_REFUSAL`
beyond it — so **alert banners are now bounded**.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/digest.js | `DigestCaps.MAX_LINES` 120 → 400; update the doc comment's approval date and the constant's inline comment |
| modify | tests/unit/digest.test.js | the **four** edits in "Exact contracts" (lines 428, 532, 1311, 1326) plus one appended regression test |

No golden fixture is touched (`tests/golden/digest-default.md` is 45 lines). No
other source file reads `MAX_LINES`.

**The neighbouring edit to this file has already landed.**
`WP-quarantine-banner-decay` (now `Done`) rewrote three `quarantineLine` string
literals here — the predicted-disjoint hunks — and merged first. Its net effect on
this WP is a uniform **+3 line shift** of all four targets; the citations above
are post-shift. No sequencing question remains, and the two changes never
overlapped in substance: their three strings are `quarantineLine` *inputs* to
`renderDigest`, this WP's four are cap fixtures and cap assertions.

### Exact contracts

**1. The constant.** Replace lines 23–25 of `src/core/digest.js` (the doc
comment, the `const DigestCaps = {` line, and the `MAX_LINES` line) with exactly:

```js
/** Digest size caps (audit A6, F3/F5). Values OWNER-APPROVED 2026-07-17; MAX_LINES
 *  raised to 400 OWNER-APPROVED 2026-08-30 — see the spec. */
const DigestCaps = {
  MAX_LINES: 400, // secondary guard only; MAX_BYTES is the primary cap (WP-digest-line-cap-raise)
```

> **Errata, 2026-08-30 (post-merge) — and a divergence from the shipped source,
> deliberately left open.** This block mandated `re-approved at its current
> value OWNER-APPROVED 2026-08-30`, which is false on its face next to a
> 120 → 400 change: 400 was not the value being re-approved, it is the new one.
> The wording is corrected above so the archived spec does not instruct a future
> reader into the false reading. **`src/core/digest.js` still carries the
> original phrasing** — that is product code, out of scope for this docs-only
> archive pass, and it is recorded here rather than silently fixed. Whoever next
> touches `DigestCaps` should bring the source comment to the wording above; it
> needs no owner decision, only a one-line edit in a PR that already has a
> reason to be in that file.

Leave `MAX_BYTES`, `MAX_NOTE_BYTES`, `MAX_PROJECTS`, `MAX_DAILY_READ_BYTES` and
`TRUNCATION_MARKER` byte-identical. Change no logic in `capDigest`.

**Why 400, stated so it can be re-derived** (put nothing of this in the code
beyond the comment above; it lives here):

- **Measured need:** 205 body lines on a heavily-developed real identity set
  (four notes, 257 source lines), 2026-08-30.
- **Headroom:** ~2× the measured need, so a growing vault does not re-hit the
  wall in a month.
- **The byte cap goes back to being primary:** at the measured ~52 bytes/line,
  400 lines ≈ 20.8 KB, comfortably inside the 32 KB `MAX_BYTES`. For realistic
  prose content the byte cap now binds first, which is the intent.
- **The line cap still earns its place:** a vault of ~5,000 near-empty lines is
  ~10 KB — under `MAX_BYTES`, and useless as session context. 400 catches that
  shape; removing the line cap would not.

**2. Test fixture generation — make it cap-relative, not cap-hardcoded.** In both
existing tests, replace the hardcoded loop bound with a bound derived from the
cap, and shorten the item text so the fixture stays under the per-note byte cap
(`MAX_NOTE_BYTES`, 8 KB) — otherwise the *note* cap would truncate first and the
test would silently stop exercising the *line* cap it is named for.

In `tests/unit/digest.test.js` at line 431's test (the `- item ${i}` loop is
line 436), replace:

```js
  const items = [];
  for (let i = 0; i < 200; i++) items.push(`- item ${i}`);
```

with:

```js
  const items = [];
  for (let i = 0; i < DigestCaps.MAX_LINES + 80; i++) items.push(`- i ${i}`);
  assert.ok(
    Buffer.byteLength(items.join('\n'), 'utf8') < DigestCaps.MAX_NOTE_BYTES,
    'fixture must stay under the per-note byte cap so the LINE cap is what truncates'
  );
```

Apply the **same** two-line replacement at line 535's test (whose
`for (let i = 0; i < 300; i++)` is line 538), including the same guard assertion.

Both tests already assert `lines.length <= DigestCaps.MAX_LINES + 1` and the
presence of `DigestCaps.TRUNCATION_MARKER`; leave those assertions unchanged —
they are already cap-relative. The line-boundary-safety loop in the first test
checks `l.startsWith('- item ')`; change that prefix to `'- i '` so it still
matches the shortened items. (The `- i` prefix stays distinctive: not one line
in `tests/fixtures/identity-filled/06-Identity/*.md` begins with a dash-space
bullet — verified 2026-08-30, count zero in all four notes — so the loop cannot
pick up an unrelated fixture line.)

**3. The literal cap pin at line 1326** (inside the test that starts at line
1314). The test
`AC4 — the banner template and cap constants are unchanged; entries keep their order`
ends with:

```js
  assert.equal(DigestCaps.MAX_LINES, 120, 'cap constants unchanged');
```

That assertion belongs to a shipped WP whose claim was *"unchanged **by that
WP**"*, not *"never changes"*. Keep it a real pin — do not delete it, do not
loosen it to a comparison against `DigestCaps.MAX_LINES` itself (which would
assert nothing). Replace it with:

```js
  assert.equal(DigestCaps.MAX_LINES, 400, 'cap constants unchanged by that WP; raised by WP-digest-line-cap-raise');
```

**4. The ceiling-regression guard at line 1329** (its `length: 60` fixture line
is 1343). The test
`AC4 — under cap pressure WITH a daily entry, both caps hold and the marker is retained`
builds four identity notes out of long lines and asserts that the truncation
marker survives. At a 400-line cap its fixture no longer reaches either cap, so
the marker assertion fails. **Its purpose must be preserved, not its numbers**:
its own comment states the LINE half is the tight half ("mutating `lineBudget` to
drop its prefix reservation turns this test red") and concedes the BYTE half is
not tight. Rescale the fixture so the line cap is exercised again — replace:

```js
    const bulk = Array.from({ length: 60 }, (_, i) => `- ${f}-${i} ${'x'.repeat(400)}`).join('\n');
```

with:

```js
    const bulk = Array.from({ length: 110 }, (_, i) => `- ${f}-${i} ${'x'.repeat(50)}`).join('\n');
```

**Measured with that fixture at `MAX_LINES: 400`**, running the test's own
setup — which includes `writeDailyRaw(tmp, MALFORMED_DAILY)`, the daily entry the
test is named for: `401` lines against the 400 cap — i.e. cap + marker — and
**`25,159` bytes** against `MAX_BYTES` 32,768, with the truncation marker
present. The test passes and keeps its tight half tight.

> **Errata, 2026-08-30 (post-merge).** This figure read `25,055` until the
> archive pass. That number came from a measurement harness that omitted the
> malformed daily note, so it measured a digest with no prefix banner — not the
> fixture this contract describes. Both round to the `~24.5 KiB` the shipped
> comments carry, so nothing downstream moved; the exact byte count is corrected
> here because the acceptance criterion below asserts that a comment's figure
> matches what the fixture actually produces, and a spec that states the wrong
> input to that comparison cannot support it. Re-measured on `efca39c`.

**This rescale falsifies TWO byte-figure comments in that test, not one, and
both must be updated.** The acceptance criterion below is satisfied only when
neither still states a figure the rescaled fixture does not produce.

*Comment A — the setup block, above the `for (const f of [...])` loop.* Replace

```text
  // never approach the 32 KiB whole-digest ceiling. Long lines rather than
  // many short ones, so the bytes that survive the line cap are near the byte
  // ceiling too — measured 31.7 KiB of 32 KiB here. See the note below on
```

with

```text
  // never approach the 32 KiB whole-digest ceiling. Enough short lines per
  // note that the LINE cap is what trims — measured ~24.5 KiB of 32 KiB here.
  // See the note below on
```

*Comment B — the explanatory note below the line-cap assertion.* Replace

```text
  // notes filled to their per-note ceiling AND 60 projects, renderDigest tops
  // out at ~31.4 KiB against MAX_BYTES = 32 KiB, because MAX_NOTE_BYTES (8 KiB)
```

with

```text
  // notes filled with shorter lines AND 60 projects, renderDigest tops out at
  // ~24.5 KiB against MAX_BYTES = 32 KiB, because MAX_NOTE_BYTES (8 KiB)
```

> **Errata, 2026-08-30 (post-merge).** Comment A was **not named here** when this
> spec was dispatched; only Comment B was. The implementer had to find it
> anyway — the acceptance criterion's "comment matches measurement" rule reaches
> every comment in the test, not only the ones this list happens to enumerate,
> and the review caught the omission. Both are named now so the archived text
> matches what shipped. Rewrapping is expected: reflowing Comment A leaves an
> orphaned short line, which `f3dbf6f` tidied.

Leave the rest of that comment — including its honest statement that dropping
`prefixBytes` from `bodyByteBudget` leaves the suite green — exactly as it is.

**5. New regression test.** Append to the "Digest size caps" section of
`tests/unit/digest.test.js`:

```js
test('a real-vault-sized identity body (205+ lines) is NOT truncated (WP-digest-line-cap-raise)', () => {
  const tmp = tmpVault();
  // 205 lines is the measured uncapped body of the maintainer's live vault
  // (2026-08-30) — the size that the old 120-line cap cut mid-Preferences,
  // dropping ## Goals and ## Standing instructions entirely.
  const items = [];
  for (let i = 0; i < 170; i++) items.push(`- i ${i}`);
  const note =
    '---\nid: i\ntype: identity\norigin: interview\nstatus: active\n---\n\n' +
    `# Standing instructions\n\n${items.join('\n')}\n`;
  fs.writeFileSync(path.join(tmp, '06-Identity', 'instructions.md'), note);

  const digest = renderDigest(tmp, undefined, { identityApprovals: approvals(tmp) });
  assert.ok(digest.split('\n').length > 200, 'fixture renders past the old 120-line cap');
  assert.ok(!digest.includes(DigestCaps.TRUNCATION_MARKER), 'no truncation at real-vault size');
  assert.ok(digest.includes('## Standing instructions'), 'the last identity section survives');
  assert.ok(digest.includes('- i 169'), 'the last line of the last identity note survives');
});
```

> **Errata, 2026-08-30 (post-merge).** As dispatched this snippet used **160**
> items and probed for `- i 159`, while asserting `> 200` lines — and **160 items
> renders 199 lines**, so the snippet failed its own second assertion. The implementer raised it to `170` (209 lines) and moved the
> last-line probe with it; the shipped test is the truth and this block is now
> byte-identical to it. Re-measured on `efca39c`: 160 → 199 lines (assert FAILS),
> 170 → 209 lines (assert passes, `- i 169` present). **The `> 200` assertion was
> right and the fixture was wrong** — the spec picked the item count by
> subtracting from the 205-line real-vault figure without rendering it once.

`tmpVault()` (line 228) and `approvals()` (line 34) already exist in that file;
`fs`, `path`, `renderDigest`, `DigestCaps` and `assert` are already imported.

## Contract reference (optional — mark N/A if this WP is not contract-dense)

N/A — this WP changes one scalar constant that every consumer imports as
`DigestCaps.MAX_LINES` rather than restating; only trigger (vii) is even
arguable, and ADR-0031's discipline needs two of the seven.

## Implementation notes & constraints

- **Do not touch `capDigest`'s logic.** The prefix-reservation arithmetic, the
  byte pass, the UTF-8-safe hard cut and the marker placement are all correct and
  already tested; this WP moves a number.
- **Do not change `MAX_BYTES`.** The owner's decision is explicit: 32 KB stays,
  and it stays the primary cap.
- **Do not update `tests/golden/digest-default.md`.** It is 45 lines; the raise
  cannot change it. If your run says otherwise, stop — something else is wrong.
- **A very large banner prefix can still starve the body — already routed, do
  not touch it here.** `capDigest` reserves the whole prefix and gives the body
  what is left. Measured on the live install 2026-08-30: `state/digest.md` was
  23,040 bytes, of which **16,805 bytes were a single quarantine-banner line**
  enumerating 191 skipped transcripts — 70% of the 32 KB budget spent before the
  body starts, leaving ~15.7 KB. The full 10,675-byte body still fits, so this
  raise delivers today even under that banner.
  **That figure is already historical, and this is not an open owner question.**
  `WP-quarantine-banner-decay` is **`Done`** —
  `docs/specs/done/WP-quarantine-banner-decay.md`, merged 2026-08-30 (PR #41),
  shipped in `src/core/dream/ledger.js` (`+104` lines). It collapses that banner
  to a fixed-size count-plus-pointer sentence with no filename list, on a 7-day
  decay window, and it explicitly did not touch `digest.js`, `DigestCaps` or
  `capDigest` — `src/core/digest.js` is byte-unchanged by the whole
  `quarantine-surface` epic. So the 16,805-byte banner line is gone from the
  product: the prefix is now a couple of hundred bytes and the body budget is
  effectively the full 32 KB. The two figures this WP's `400` is derived from —
  205 body lines and 10,675 body bytes — are prefix-independent and were true
  before and after. Alert banners are separately bounded too (`renderAlertField`,
  `MAX_FIELD_CHARS` = 2,000, imported from `src/core/alerts.js`). **Nothing about
  the prefix is this WP's to change**; the measurement is kept only because it is
  what the `400` was sanity-checked against under the worst prefix the product
  ever shipped.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR description. Do NOT expand scope to resolve ambiguity.

## Acceptance criteria

- [ ] `DigestCaps.MAX_LINES === 400`; `MAX_BYTES`, `MAX_NOTE_BYTES`,
      `MAX_PROJECTS`, `MAX_DAILY_READ_BYTES` and `TRUNCATION_MARKER` are
      unchanged.
- [ ] The `DigestCaps` doc comment carries `OWNER-APPROVED 2026-08-30` for the
      re-approved line cap alongside the existing `OWNER-APPROVED 2026-07-17`.
- [ ] **All four** measured-failing tests pass, and each keeps the property it
      was written for:
      - the tests at lines 431 and 535 derive their fixture size from
        `DigestCaps.MAX_LINES` (no literal `200` / `300` remains) and both still
        emit the truncation marker;
      - the test at line 1314 still pins the cap to a **literal** value, now
        `400` — its assertion (line 1326) is not deleted, and not loosened into a
        self-comparison;
      - the test at line 1329 still emits the truncation marker with a daily
        entry in the prefix, and **every** byte figure stated in **any** of its
        comments matches what its rescaled fixture actually produces — the
        criterion quantifies over the whole test, not over the comments Contract
        4 happens to enumerate. (Two comments carry one: the setup block's and
        the note below the line-cap assertion.)
- [ ] No literal `120` line-cap assertion survives anywhere in
      `tests/unit/digest.test.js`.
- [ ] A digest body of more than 200 lines renders with **no** truncation marker
      and with its last identity section (`## Standing instructions`) intact.
- [ ] `tests/golden/digest-default.md` is byte-unchanged.
- [ ] Full `npm test` passes except the pre-existing, machine-local
      `tests/integration/adopt-e2e.test.js` pinned-`claude`-path failure, which
      must reproduce identically on a stashed tree (show both runs in the PR).
      Baseline for comparison, measured on `main` = `0410e3a` 2026-08-30:
      `tests 2239 / pass 2225 / fail 5` with the cap raised and no test edits;
      the finished state must show `fail 1` (adopt-e2e alone).
- [ ] `src/core/dream/ledger.js` and `src/cli/dream.js` are not touched (they
      belong to the landed `quarantine-surface` epic).
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
# 1. The constant, read from the module (not grepped from prose).
node -e 'const {DigestCaps}=require("./src/core/digest");
const want={MAX_LINES:400,MAX_BYTES:32768,MAX_NOTE_BYTES:8192,MAX_PROJECTS:50,MAX_DAILY_READ_BYTES:65536};
for (const [k,v] of Object.entries(want)) { if (DigestCaps[k]!==v) { console.error(`${k}=${DigestCaps[k]} want ${v}`); process.exit(1); } }
console.log("DigestCaps ok:", JSON.stringify(want));'

# 2. The owner-approval trail is recorded in the source.
grep -n "OWNER-APPROVED 2026-08-30" src/core/digest.js

# 3. No hardcoded line counts left in the cap tests, and the literal 120 pin is gone.
grep -n "MAX_LINES + 80" tests/unit/digest.test.js        # expect 2 hits
grep -c "i < 200;\|i < 300;" tests/unit/digest.test.js    # expect 0
grep -c "DigestCaps.MAX_LINES, 120" tests/unit/digest.test.js   # expect 0
grep -n "length: 110" tests/unit/digest.test.js           # the rescaled ceiling guard

# 3b. All four previously-failing tests now pass, named explicitly.
node --test tests/unit/digest.test.js 2>&1 | grep -E "^ℹ (tests|pass|fail)"
npm test -- --test-name-pattern 'over-MAX_LINES|active banners|AC4' 2>&1 | tail -8

# 3c. This WP touches only the cap tests: print its hunk headers and confirm none
#     lands in the 181-196 or 1098-1104 regions that WP-quarantine-banner-decay
#     (Done) rewrote.
git diff -U0 -- tests/unit/digest.test.js | grep -E "^@@" 

# 4. The golden is untouched.
git diff --stat -- tests/golden/

# 5. Targeted then full.
npm test -- --test-name-pattern 'MAX_LINES|real-vault-sized|banners'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Changing `MAX_BYTES`, `MAX_NOTE_BYTES`, `MAX_PROJECTS`, `MAX_DAILY_READ_BYTES`,
  or any `capDigest` logic.
- Anything about how the digest is *delivered* to a session — the SessionStart
  hook is `WP-session-start-digest-dedup`, the `doctor` drift check is
  `WP-doctor-digest-block-drift`.
- The empty `## Active projects` section. `listProjectDirs`
  (`src/core/digest.js` line 387) lists only sub*directories*, and a vault
  that keeps one `.md` file per project under `01-Projects/` (PARA
  note-per-project style — 17 such files on the maintainer's vault, zero
  subdirectories) therefore renders no projects at all. **Still true on fork
  `main`:** the fork added `sanitizeProjectName` for the display of the names it
  finds, but left the `isDirectory()` filter untouched, so nothing about this
  changed. Directory-per-project versus note-per-project is an owner decision and
  a future WP. Do not touch it.
- Anything owned by the (now `Done`) `quarantine-surface` epic. In particular do
  not touch `src/core/dream/ledger.js` or `src/cli/dream.js` — they carry the
  decay and warnings-file work and are outside this Deliverables table.
- Reducing the control-plane prefix's size, or changing how `capDigest` splits
  the budget between prefix and body.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(digest): raise the line cap (WP-digest-line-cap-raise)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
