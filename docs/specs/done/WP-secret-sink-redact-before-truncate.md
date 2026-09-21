---
id: WP-secret-sink-redact-before-truncate
title: Scan the whole field value before the 2000-character cap at the three truncate-then-redact sinks
status: Done
model: sonnet
size: S
depends_on: [WP-secret-sink-wiring-probes]
adrs: [ADR-0024, ADR-0025, ADR-0031, ADR-0042]
epic: secret-lifecycle
---

# WP-secret-sink-redact-before-truncate: scan before the cap in `alerts.jsonl` and `run-evidence.jsonl`

> **Errata, 2026-09-21 (post-merge) — two stale spec-prose facts, one new
> accepted residual, and one recorded-not-swept cite drift. None is a defect in
> what shipped.**
>
> **Landed in PR #303** (merge `42bd4836`, 2026-09-18 22:45:35 UTC), tip
> `17070f40`. **Branch was `wp/redact-before-truncate`**, not the
> `wp/secret-sink-redact-before-truncate` this spec's Definition of done item
> 1(d) names — an orchestrator dispatch error, accepted-and-noted in the gate
> comment and fixed in the dispatch template for the remaining packages in this
> stream.
>
> **Two gate rounds; the PR carries the round-2 comment only.** Round 2 on
> `17070f40`: wd-reviewer (spec fidelity) **APPROVE** — the delta
> `9f5b0b6a..17070f40` mechanically confirmed as comments plus the logbook file
> (`git diff -U0 -- src/ tests/` minus comment lines is empty); a fresh detached
> worktree measured `npm test` 2908 / 2896 pass / **0 fail** / 12 skipped,
> `npm run lint` 0, `boundary-check` 0, this spec's verification script
> `ALL GATES PASSED`, and the three Table C `find` anchors still occurring
> exactly once each; round-1 findings 1–5 closed. The independent gate (Codex
> plugin `review` on `gpt-6-astra`) raised one `[P2]`, adjudicated below as
> **accepted residual 3** and **not taken in this WP**. CI on `17070f40`: seven
> checks pass.
>
> **Red-proofs verdict.** The implementer's **UNFILTERED** `npm run red-proofs`
> was run on the round-1 tip `9f5b0b6a`: **106 declared proof(s), 106
> selected**, `RUN: PROVEN`, with all three of this package's declarations
> (`alerts-truncate-before-redact`, `run-evidence-argv-truncate-before-redact`,
> `run-evidence-field-truncate-before-redact`) `PROVEN` and no `ERROR`,
> `GATE FAIL` or `not ok` line anywhere in the run. It was **not re-run on the
> merged tip**, and the PR body says so: the `9f5b0b6a..17070f40` delta changes
> no line of `src/core/alerts.js` or `src/core/run-evidence.js` other than
> comments and one doc-comment line wrap, so no Table C `find` anchor moved.
> That is the verdict this record claims — the implementer's log on the round-1
> tip, carried forward by a measured comment-only delta, not an independent
> re-run on `17070f40`.
>
> **Erratum 1 — Current state (`:89`) pinned a `tests/red-proofs/` count that
> was already stale when the work started.** *What is wrong:* *"`tests/red-proofs/`
> holds **24** `*.proofs.json` files (count, do not assume)"*, pinned to `main`
> at `08de2bc3`. *What is true:* the directory held **26** at the merged tip
> `17070f40` (the implementer re-derived this at dispatch time and named the two
> added files), **28** at the merge commit `42bd4836`, and — counted, not
> assumed — **34** on `origin/main` at `8b4cbd4c` on 2026-09-21, the day this
> record was written. *Routing:* **corrected in place**, and the sentence now
> carries the same instruction its own parenthesis already gave: this is a
> directory-wide total that every sibling package moves, so it is provenance,
> never a contract. Nothing in this package depended on the number — the two
> deletions and two creations are named individually in Deliverables.
> **Class: a spec cell pinning a number it does not own.**
>
> **Erratum 2 — `src/core/alerts.js:48` is `:47` in the landed tree, in both of
> the two places this spec cites it.** *What is wrong:* Table A row A1's
> anchor cell reads `` `src/core/alerts.js` (`:48`) ``, and the Current-state
> closure bullet's measured `grep -n 'slice(0' …` output lists `alerts.js:48`.
> *What is true:* on `origin/main` at `8b4cbd4c` that grep returns
> `src/core/alerts.js:47`, `src/core/run-evidence.js:64`, `:78` and `:91` — the
> three `run-evidence.js` numbers are unmoved and only the `alerts.js` one is
> off by one. *Routing:* **corrected in place, both mirrors in the same edit**,
> as the Mirrored Surface Checklist's Table A bullet and Current-state bullet
> require. The construct is what authenticates the site (this spec says so at
> `:64-65`) and the construct is unchanged; nothing shipped wrong.
> **Class: a line cite going stale in a file the package itself edits.**
>
> **Erratum 3 — a NEW accepted residual: entropy dilution by adjacent
> same-alphabet padding.** The independent gate's round-2 `[P2]` reported that
> `'.'.repeat(1968) + '0123456789abcdef0123456789abcdef' + 'F'.repeat(5000)`
> writes the complete 32-character token through `recordRunEvidence` on this
> tip, where the pre-fix order redacted it. **Reproduced**, then bounded with
> controls run on both trees through the public entry point with the artifact
> read from disk:
>
> | value | main `06ccdb95` | tip `17070f40` |
> |---|---|---|
> | `'.'×1968 + TOKEN + 'F'×5000` (the reported case) | redacted | **leaks** |
> | `'.'×1968 + TOKEN` (ends at the cap, no padding) | redacted | redacted |
> | `TOKEN + 'F'×5000` (same padding, no cap involved) | **leaks** | **leaks** |
> | `TOKEN + 'F'×100` (132 chars, far under the cap) | **leaks** | **leaks** |
>
> `TOKEN` is the 32-character hex run above. Rows 3 and 4 are what make the
> class pre-existing: a ≥24-character high-entropy token glued to
> `[A-Za-z0-9+=/]` padding is **not a candidate by the scanner's own
> definition** — `entropyPass` (`src/core/secret-scan.js:262`) measures Shannon
> bits over the *maximal* candidate run against
> `ScanLimits.ENTROPY_MIN_BITS_PER_CHAR` (3.5, `:28`), and the padding dilutes
> the run below the floor — so it leaks on `main` today at every position except
> one: when the 2000-character cap happened to fall inside the padding, the
> pre-fix order severed the padding and the truncated run passed the floor **by
> accident**. That accidental, cut-position-dependent catch is what the fix
> loses; it was never a guarantee, and the same token 100 bytes earlier was never
> protected. *Disposition — not taken in this WP*, for two independent reasons
> recorded at adjudication: (a) the proposed remedy (a second `redactOnly` over
> the capped result) contradicts this spec's frozen contract — Table A's three
> byte-exact expressions, *"the same move … nothing else changes"*, and
> verification steps AC1/AC2 which grep for exactly those expressions — and
> would restore only the cap-position accident, not the class, while a second
> pass can lengthen a field past the 2000-character bound (a short `key=value`
> rewritten to `key=[REDACTED:generic-secret]`), which then needs a third cut;
> (b) the defect belongs to the **scanner's entropy rule**, not to sink order.
> Net: three deterministic labelled-token leaks closed against one accidental
> entropy catch lost. *Routing:* **recorded as accepted residual 3 below**, with
> the table above as its threat-model row. **Owner backlog candidate (not a
> decision taken here): a scanner-side windowed- or run-boundary-entropy rule.**
> **Class: a pre-existing detector limitation exposed by an order change, not
> caused by it.**
>
> **Recorded, deliberately not swept.** This spec's Current-state bullet for
> `src/core/secret-scan.js` — *"`ScanLimits.SCAN_MAX_BYTES` is `256 * 1024`
> (`:22`); `redactOnly` is `:314-316`"* — shifted when
> `WP-secret-stream-safe-cut-redactor` (PR #306) landed in that file: on
> `origin/main` at `8b4cbd4c` the constant is `:26` and `redactOnly` is
> `:325-327`. Both values are unchanged and the file was explicitly **not
> modified by this WP**, so the drift is recorded in this one sentence rather
> than swept — the numbers belong to a file this package does not own and will
> move again.
>
> **Non-errata, recorded from the PR body.** The implementer rewrote three test
> comments its own diff falsified (*"Cut before scan … keeps exactly
> `PROBE_HEAD`"*, in `tests/unit/alerts.test.js` and `tests/unit/run-evidence.test.js`
> ×2) to describe the shipped scan-before-cut order; the `Table S row S<n>`
> provenance lines above each `test(` call were left untouched. Accepted
> residual 2 stood at merge: this package closed three of the seven known sink
> defects, and the four `WD-SINK-CHUNK-*` ids were still open — they close with
> `WP-secret-sink-chunk-fix` (PR #310).

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog has **one** shared secret detector, `src/core/secret-scan.js` (ADR-0024).
It exports `scanAndRedact(text) -> {text, findings}` and the back-compat wrapper
`redactOnly(text) -> string`, defined as `scanAndRedact(text).text`. A match is
replaced inline by `[REDACTED:<label>]`; for example the `anthropic-key` rule
(`/sk-ant-[A-Za-z0-9\-_]{20,}/g`) turns a 48-character key into the 24-character
token `[REDACTED:anthropic-key]`. The detector is **total and fail-closed**: a
non-string becomes `''`; an input over `ScanLimits.SCAN_MAX_BYTES` (262144) is
**not scanned at all** and the whole input is replaced by the fixed 56-character
string `[wienerdog: oversized content withheld from secret scan]`; any internal
error returns `[wienerdog: secret scan failed — content withheld]`. It never
throws and never returns raw text on a degraded path.

Two durable JSONL files are written through that detector and both cap each
string field at 2000 characters: `~/.wienerdog/state/alerts.jsonl` (the
append-only failure log behind `wienerdog alerts` and the digest banner) and
`~/.wienerdog/state/run-evidence.jsonl` (the per-run hermetic-posture record,
ADR-0025 — whose documented contract is that it is *bounded and secret-free*, and
whose free-text argv values are reduced to `sha256:<hex>` rather than stored).

**Three call sites cut the value BEFORE they scan it**, so a credential
straddling the cut loses the tail its rule needs and the surviving head is
written raw. `WP-secret-sink-wiring-probes` (Done, PR #261) measured this and
committed three tests that assert the leak is **positively present**, each named
`… (KNOWN DEFECT <id>)`: `WD-SINK-TRUNC-ALERTS`, `WD-SINK-TRUNC-RUNEV-ARGV`,
`WD-SINK-TRUNC-RUNEV-FIELD`. Measured leak: exactly 24 raw characters of a
48-character key. Exposure is same-user (the files are 0600 under a 0700
directory), which is the boundary the threat model already draws — but
`run-evidence.jsonl` is *documented* as secret-free, and it measurably is not.

**This WP closes those three, and only those three.** Swapping the two steps is
sufficient and complete for everything the detector catches: after `redactOnly`
the text contains no detectable secret, so cutting it can only split ordinary
text or a code-owned `[REDACTED:…]` token — it cannot expose a credential byte.
The four chunk-boundary defects at the two stream sinks
(`WD-SINK-CHUNK-BRAIN-STDOUT`, `-BRAIN-STDERR`, `-RUNJOB-STDOUT`,
`-RUNJOB-STDERR`) are a different mechanism and are fixed by
`WP-secret-sink-chunk-fix`; nothing here touches them, and a green suite after
this WP still means those four are open.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP edits three
expressions, three tests and two inert JSON declaration files. It starts no
process and adds no dependency.

## Current state

Measured on `main` at **`08de2bc3`**. Line numbers disambiguate; grep for the
cited construct, which is what authenticates it.

- `src/core/secret-scan.js` — the detector. **Not modified by this WP.**
  `ScanLimits.SCAN_MAX_BYTES` is `256 * 1024` (`:22`); `redactOnly` is `:314-316`.
- The three sites are **Table A**; their pre-fix text is Table A's
  `CURRENT` lines, each measured to occur **exactly once** in its
  file. Public entry points: `appendAlert(paths, record)` (`src/core/alerts.js`)
  and `recordRunEvidence(paths, rec)` (`src/core/run-evidence.js`). Both are
  best-effort and never throw.
- `MAX_FIELD_CHARS` is `2000` and **is exported** from `src/core/alerts.js`
  (`:29`); `src/core/run-evidence.js` uses the literal `2000` at both of its
  sites and exports no cap.
- `src/core/run-evidence.js:91` maps `policyHooks.sources` through the **same**
  `scrub` it defines at `:78`, so site A3's fix covers that array too; there is
  no fourth truncate-then-redact expression in either file (measured:
  `grep -n 'slice(0' src/core/run-evidence.js src/core/alerts.js` returns
  `run-evidence.js:64`, `:78`, `:91` and `alerts.js:47`, and `:91` is the
  `.slice(0, 20)` element-count bound on that array, not a character cap).
- `tests/unit/alerts.test.js` — holds probes P1 (`:427`) and P2 (`:438`), the
  shared fixtures `PROBE`/`PROBE_HEAD`/`PROBE_TAIL`/`MARKER` (`:405-416`),
  `safeOf` (`:418`) and `DEFECT_MSG` (`:420`). `PROBE_TAIL` is declared and
  unused.
- `tests/unit/run-evidence.test.js` — holds probes P3 (`:150`), P4 (`:161`),
  P5 (`:180`) and P6 (`:191`), with the same fixture block at `:124-148`.
- `tests/red-proofs/` holds `*.proofs.json` files whose total every sibling
  package moves — **26** at this package's merged tip `17070f40`, **34** on
  `origin/main` at `8b4cbd4c` on 2026-09-21 (count, do not assume; see erratum 1).
  Two of them — `secret-sink-wiring-probes-alerts.proofs.json` and
  `secret-sink-wiring-probes-run-evidence.proofs.json` — declare mutations that
  apply **this WP's fix** to prove the pre-fix probes were not vacuous. Once the
  fix lands their `find` strings no longer match and the ADR-0042 lane fails
  loud, by design. Table C replaces them with the inverse.
- `npm test` is `node tests/run.js`; `npm run lint` is `node scripts/lint.js`;
  `npm run red-proofs` is `node tests/with-temp-root.js scripts/red-proofs.js`.

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/alerts.js | site A1 only — replace Table A's `CURRENT` line by its `REQUIRED` line; no other change |
| modify | src/core/run-evidence.js | sites A2 and A3 only — same replacement, per Table A |
| modify | tests/unit/alerts.test.js | convert probe P2 per Table B; add `LEAK_MSG`; delete `DEFECT_MSG` once unused; add the oversized case (AC5) |
| modify | tests/unit/run-evidence.test.js | convert probes P4 and P6 per Table B; add `LEAK_MSG`; delete `DEFECT_MSG` once unused |
| delete | tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json | its mutation is now the shipped code; replaced by Table C row C1 |
| delete | tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json | replaced by Table C rows C2 and C3 |
| create | tests/red-proofs/secret-sink-redact-before-truncate-alerts.proofs.json | Table C row C1 only; `suite` is `tests/unit/alerts.test.js` |
| create | tests/red-proofs/secret-sink-redact-before-truncate-run-evidence.proofs.json | Table C rows C2 and C3 only; `suite` is `tests/unit/run-evidence.test.js` |

Add nothing else to those files. Do not edit any other existing test.

Per `docs/specs/_TEMPLATE.md` lines 33-35 and `scripts/boundary-check.js`, this
spec file, `package-lock.json`, `memory/lessons/inbox.md` and anything under
`docs/specs/logbook/` are exempt from every Deliverables table and are therefore
not listed, while remaining permitted in the verification whitelist below.

### Exact contracts

The replacement at every site is the **same move**: take the `.slice(0, CAP)` out
of the `redactOnly(…)` argument and apply it to the result. Table A fixes the
three literal pairs; nothing else in those expressions changes — same `String()`
coercion, same null handling, same cap, same variable names.

The one behaviour change beyond the leak is at the detector's oversized cliff,
and it is deliberate: a field longer than `SCAN_MAX_BYTES` (262144 bytes) is
**not scanned**, so `redactOnly` returns the 56-character oversized marker and
the cap keeps all of it. Such a field therefore becomes
`[wienerdog: oversized content withheld from secret scan]` instead of its first
2000 characters. That is fail-closed and visible, and it is the only order in
which no size threshold hands an attacker a choice of code path: a pre-cut would
restore the leak for exactly the inputs a caller can pad into.

The converted probes get a fixed failure message so that a red probe no longer
prints the probe value into CI output (a residual the predecessor spec named and
accepted). Define it once per test file, taking the regression id:

```js
const LEAK_MSG = (id) =>
  `${id}: this sink must scan the whole value before it applies the field cap. ` +
  'A raw head of a credential survived the cut. See Table A of ' +
  'WP-secret-sink-redact-before-truncate; do not weaken or delete this test.';
```

## Contract reference

Activation (ADR-0031, 3 of 7): (iv) the fail-closed behaviour at the oversized
threshold changes; (vi) the successor `WP-secret-sink-chunk-fix` inherits this
package's probe-conversion and declaration-replacement convention; (vii) the same
three-site inventory appears in Deliverables, the acceptance criteria and the
verification greps.

Canonical tables: **A** (the sites and their two expressions), **B** (the probe
conversions), **C** (the RED declarations).

### Table A — canonical: the three capped-field scrub sites

| # | File | Enclosing construct (grep anchor) | Cap | Line in the literal block below |
|---|------|-----------------------------------|-----|---------------------------------|
| A1 | `src/core/alerts.js` (`:47`) | `sanitizeAlert`'s `scrub` | `MAX_FIELD_CHARS` (2000, exported) | the `A1` pair |
| A2 | `src/core/run-evidence.js` (`:64`) | `sanitizeArgv`, per argv element | literal `2000` | the `A2` pair |
| A3 | `src/core/run-evidence.js` (`:78`) | `sanitizeRecord`'s `scrub`, per scalar field and per `policyHooks.sources` element | literal `2000` | the `A3` pair |

**The two expressions per row, byte-exact, leading indentation included.** They
live in a fenced block rather than in table cells because the indentation is
load-bearing: it is part of the `grep -cF` gate below and part of each Table C
declaration's `find` string, and a markdown code span cannot carry a leading
space. Each `CURRENT` line is measured to occur **exactly once** in its file at
`08de2bc3`; each `REQUIRED` line is what must occur exactly once after this WP.
The `# A<n> …` lines are labels and are not part of any string.

```text
# A1 CURRENT
  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));
# A1 REQUIRED
  const scrub = (v) => redactOnly(String(v == null ? '' : v)).slice(0, MAX_FIELD_CHARS);
# A2 CURRENT
    out.push(redactOnly(a.slice(0, 2000)));
# A2 REQUIRED
    out.push(redactOnly(a).slice(0, 2000));
# A3 CURRENT
  const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, 2000));
# A3 REQUIRED
  const scrub = (v) => redactOnly(String(v == null ? '' : v)).slice(0, 2000);
```

**The list is closed.** These are every expression in the tree that cuts a value
before handing it to the detector. The other `redactOnly` callers are unaffected
and out of scope: the transcript sink already redacts before its cap
(`src/core/transcripts/index.js:68`, called by `capMessage`); the job-log failure
message redacts a whole composed string with no cap (`src/cli/run-job.js:1120`);
the four per-chunk stream sites (`src/core/dream/brain.js:517`, `:545`,
`src/cli/run-job.js:1055`, `:1060`) are `WP-secret-sink-chunk-fix`; and
`src/core/dream/promote.js:708`, `:865` and `src/cli/dream.js:325` are gated or
non-durable callers the predecessor spec already excluded.

### Table B — canonical: the three probe conversions

Each probe keeps its file, its feed, its entry point and its `safeOf` invariant —
`artifact.includes(MARKER) && !artifact.includes(PROBE_HEAD)`, computed against
the artifact **read from disk**. What changes is the name, the assertion and the
message. The regression id is kept so the trail from the defect to its fix stays
greppable.

| # | File | Old test name (delete this name) | New test name (exact) | New assertion (verbatim, one line) |
|---|------|----------------------------------|-----------------------|-------------------------------------|
| B1 | `tests/unit/alerts.test.js` | `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is NOT redacted in alerts.jsonl (KNOWN DEFECT WD-SINK-TRUNC-ALERTS)` | `sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is redacted in alerts.jsonl` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-TRUNC-ALERTS'));` |
| B2 | `tests/unit/run-evidence.test.js` | `sink-probe: run-evidence — a labelled secret straddling the argv cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-ARGV)` | `sink-probe: run-evidence — a labelled secret straddling the argv cap is redacted in run-evidence.jsonl` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-TRUNC-RUNEV-ARGV'));` |
| B3 | `tests/unit/run-evidence.test.js` | `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is NOT redacted in run-evidence.jsonl (KNOWN DEFECT WD-SINK-TRUNC-RUNEV-FIELD)` | `sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is redacted in run-evidence.jsonl` | `assert.equal(safe, true, LEAK_MSG('WD-SINK-TRUNC-RUNEV-FIELD'));` |

Each converted probe drops its second, positive-presence assertion
(`assert.equal(artifact.includes(PROBE_HEAD), true, …)`) — it asserted the leak
was there. The `safeOf` invariant already carries the non-vacuity: it requires
`MARKER` to be **present**, which an empty artifact cannot satisfy. The feed is
unchanged (`'F'.repeat(CAP - PROBE_HEAD.length) + PROBE`), so the fixed sink
writes `'F' × 1976` followed by `[REDACTED:anthropic-key]` — exactly 2000
characters, measured 2026-09-18.

The six probes this WP does not touch (P1, P3, P5 in these two files, and P7–P16
elsewhere) keep their current names, assertions and messages.

### Table C — canonical: the declared RED proofs (ADR-0042)

Each declaration applies the **inverse** of Table A at one site — it puts the cut
back inside the `redactOnly(…)` argument — so the head survives, `MARKER` is
absent, and the converted probe's single assertion fails. The `find` string is
Table A's `REQUIRED` line for that site, i.e. the code as this WP ships it.

| # | File | Suite | Mutates | `testNamePattern` | Must redden |
|---|------|-------|---------|-------------------|-------------|
| C1 | `tests/red-proofs/secret-sink-redact-before-truncate-alerts.proofs.json` | `tests/unit/alerts.test.js` | `src/core/alerts.js` (site A1) | `straddling MAX_FIELD_CHARS` | B1 |
| C2 | `tests/red-proofs/secret-sink-redact-before-truncate-run-evidence.proofs.json` | `tests/unit/run-evidence.test.js` | `src/core/run-evidence.js` (site A2) | `straddling the argv cap` | B2 |
| C3 | same file as C2 | `tests/unit/run-evidence.test.js` | `src/core/run-evidence.js` (site A3) | `straddling the scalar-field cap` | B3 |

Field rules the runner enforces, and this spec's choices inside them:

- `wp` is `WP-secret-sink-redact-before-truncate`; `criterion` is `AC4`.
- `id` is a kebab slug unique across the whole declaration directory. Use
  `alerts-truncate-before-redact` (C1), `run-evidence-argv-truncate-before-redact`
  (C2), `run-evidence-field-truncate-before-redact` (C3). The three ids the
  deleted files carried are freed by the same commit.
- `find` is Table A's `REQUIRED` line, verbatim, `occurrences: 1`.
- `replace` is Table A's `CURRENT` line with a space and then `// <marker>` appended;
  `marker` is `RP_MUT_ALERTS_TRUNCATE_BEFORE_REDACT`,
  `RP_MUT_RUNEV_ARGV_TRUNCATE_BEFORE_REDACT`,
  `RP_MUT_RUNEV_FIELD_TRUNCATE_BEFORE_REDACT`.
- `expectRed[].test` is the `New test name` cell of Table B's matching row,
  verbatim, as a one-element array.
- `expectRed[].signal` is a substring of `LEAK_MSG('<id>')` from "Exact
  contracts" — use `<id>: this sink must scan the whole value before it applies
  the field cap`. **It must not contain `PROBE`, `PROBE_HEAD` or any part of
  them**; that is why the converted probes carry a fixed message instead of
  passing `artifact`.
- `why` states, in the declaration's own words, that the mutation restores the
  pre-fix order at that one site and that `testNamePattern` scopes the phase to
  the one probe because the mutation changes how every capped field in that suite
  is scanned.
- The observed failing set must **equal** the declared set. If a mutation reddens
  a test beyond its `Must redden` cell, narrow `testNamePattern`; if it still
  reddens more, declare those too and say so in the PR — do not weaken the
  mutation.
- **The gate is the bare unfiltered `npm run red-proofs`.** A `--wp`-filtered run
  exits non-zero by construction and is a reading, never a pass. Do not pin a
  repo-wide declaration total.

### Mirrored Surface Checklist

For each canonical table above, every surface in this spec that mirrors it, so a
review finding updates the table and all its mirrors **in the same commit**
(update-all-mirrors), and a new mirror found in review is added here on the spot
(register-new-mirrors):

- [ ] **Deliverables-table cells** — the `src/core/alerts.js` and
      `src/core/run-evidence.js` rows' site lists (A1 / A2, A3, mirroring Table
      A); the two test rows' probe lists (P2 / P4, P6, mirroring Table B); the
      four `tests/red-proofs/*.proofs.json` rows' file names and row assignments
      (mirroring Table C).
- [ ] **Acceptance criteria** — AC1 (the three required expressions), AC2 (no
      surviving pre-cut form), AC3 (the three converted names and assertions),
      AC4 (the declarations), AC5 (the oversized case).
- [ ] **Verification commands / greps** — the three `REQUIRED` line greps
      and the three `CURRENT` line counter-greps (Table A); the three new
      test names and the three old names counted at zero (Table B); the
      declaration-shape check and `npm run red-proofs` (Table C); the
      permission-boundary whitelist (Deliverables).
- [ ] **Current-state description** — the site bullet (defers to Table A), the
      `MAX_FIELD_CHARS` export note, the closure claim about a fourth site, the
      probe line numbers, and the `tests/red-proofs/` count.
- [ ] **Operative prose steps** — the Context paragraph "Three call sites cut the
      value BEFORE they scan it" and its three ids; the "Exact contracts"
      statement of the move, the oversized-cliff paragraph and the `LEAK_MSG`
      literal; Table A's closure paragraph listing the out-of-scope callers;
      Table B's paragraph on the dropped positive-presence assertion; the
      "Out of scope" list.
- [ ] **Frontmatter** — `adrs` (must list ADR-0042 while Table C is non-empty)
      and `depends_on`.

## Implementation notes & constraints

- **Three expressions, nothing else in `src/`.** Do not restructure `scrub`, do
  not introduce a shared helper across the two modules, do not add a constant.
  Both files stay dependency-free plain Node.
- **Update the comments that state the old order.** `src/core/alerts.js:36-38`
  says *"the cap bounds the scan input, then `redactOnly` guarantees…"*, and
  `src/core/run-evidence.js` documents the fields as bounded and scrubbed. Both
  are inside files this WP already modifies; correct the ordering sentence where
  it is now false. Change no other prose.
- **Existing capped-field tests may move.** After the swap a field containing a
  secret-shaped run **shrinks** before the cut (48 characters become 24), so more
  trailing content survives. If an existing length or content assertion in either
  test file moves, the assertion was pinning the old order — re-derive it and say
  so under "Decisions made". Do **not** adjust a fixture to keep an old number.
- **Acknowledged alerts key on the stored `reason` string** (`wienerdog alerts
  ack`, matched as the exact `(job, reason)` pair). An acknowledgement recorded
  before this change stops matching only if that reason both exceeded 2000
  characters and contained a secret-shaped run; acknowledgements are dropped when
  the job next succeeds anyway. No migration.
- **No new npm dependencies.** The two new files are inert JSON, never executed
  (ADR-0042 decision 1).
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT expand scope to resolve ambiguity.

### Accepted residuals

1. **A field over 262144 bytes loses its content.** It becomes the 56-character
   oversized marker instead of its first 2000 characters, so a very large alert
   `reason` stops being diagnosable. Priced and accepted in "Exact contracts":
   the alternative — falling back to a pre-cut above some size — restores the
   leak for exactly the inputs a caller can pad into.
2. **This WP fixes three of the seven known sink defects.** The four
   `WD-SINK-CHUNK-*` ids stay open, their probes stay green-because-broken, and
   a green suite after this WP must not be read as "the sinks are safe".
3. **Entropy dilution by adjacent same-alphabet padding** (added at the
   done-flip; erratum 3 at the top of this file carries the measurement and its
   four-case control table). A high-entropy token glued to `[A-Za-z0-9+=/]`
   padding dilutes the maximal candidate run below
   `ScanLimits.ENTROPY_MIN_BITS_PER_CHAR`, so `entropyPass` never treats it as a
   candidate and it is written raw. This is a pre-existing property of the
   detector, measured on `main` at every position; what this WP's order change
   loses is the one accidental catch that occurred when the 2000-character cap
   happened to sever the padding. Not fixable inside this package's frozen
   Table A contract, and a scanner-side rule is the owner's call.

## Security checklist

- [ ] Every converted probe still reads the **artifact from disk**, not the
      sink's return value, and still drives the sink through its public entry
      point (`appendAlert` / `recordRunEvidence`) — never by calling `redactOnly`
      or `scanAndRedact` directly.
- [ ] The `safeOf` invariant is unchanged and non-vacuous: `MARKER` **present**
      and `PROBE_HEAD` **absent**. `!artifact.includes(PROBE)` alone would pass
      under truncation without anything having scanned, and an empty artifact
      cannot satisfy the `MARKER` half.
- [ ] The scan now runs on the **uncapped** value. That is bounded by the
      detector itself: over `SCAN_MAX_BYTES` it does not scan at all, and every
      rule is linear-time over a byte-bounded input, so no new ReDoS or
      unbounded-work surface is opened.
- [ ] Neither new declaration file, and no committed artifact other than the two
      test sources and this spec, contains `PROBE`, `PROBE_HEAD` or `PROBE_TAIL`.
      This is why `signal` is a substring of `LEAK_MSG`, not of the artifact.
- [ ] Every probe writes into a temp root it creates itself, so nothing
      secret-shaped lands in the repo, in `~/.wienerdog`, or anywhere that
      survives the run.
- [ ] No untrusted identifier flows into a filesystem path or a shell command —
      these tests construct their own temp paths and spawn nothing.
- [ ] Nothing in this WP is described as fixing any `WD-SINK-CHUNK-*` defect.
      All four remain fully open at merge.

## Acceptance criteria

- [ ] **AC1** — Each of Table A's three sites contains its `REQUIRED` line
      verbatim, exactly once.
- [ ] **AC2** — None of Table A's three `CURRENT` line strings survives
      anywhere under `src/`.
- [ ] **AC3** — Each of Table B's three rows exists under its `New test name`,
      with its `New assertion` verbatim; none of the three `Old test name`
      strings survives anywhere in the repo except this spec; `DEFECT_MSG` no
      longer appears in either test file.
- [ ] **AC4** — Table C's two declaration files exist with exactly the rows that
      table assigns them, the deleted pair is gone, and the bare unfiltered
      `npm run red-proofs` reports `PROVEN` for this WP's criterion and exits 0.
- [ ] **AC5** — A field longer than `ScanLimits.SCAN_MAX_BYTES` fed through
      `appendAlert` is recorded as the detector's oversized marker and nothing
      else, proven by a new test in `tests/unit/alerts.test.js`.
- [ ] **AC6** — `npm test` passes and exits 0; the three converted probes pass;
      the four `WD-SINK-CHUNK-*` probes still pass (still red-on-fix).
- [ ] **AC7** — `npm run lint` passes.
- [ ] **AC8** — No file outside the eight in Deliverables is modified, **except**
      this spec file (status flip), `package-lock.json`,
      `memory/lessons/inbox.md` and `docs/specs/logbook/`.
- [ ] **AC9** — Idempotency: `N/A — this WP changes three expressions and their
      tests. It ships no command and writes nothing outside the repo.`

## Verification steps (run these; paste output in the PR)

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}

# AC1 — each Required expression present exactly once. Guarded with `test -f`
# first: a negated or counted grep over a MISSING file reads greenest exactly
# where the work was never done.
test -f src/core/alerts.js && test -f src/core/run-evidence.js
need "$(grep -cF "  const scrub = (v) => redactOnly(String(v == null ? '' : v)).slice(0, MAX_FIELD_CHARS);" src/core/alerts.js || true)" 1 "A1 required expression"
need "$(grep -cF "    out.push(redactOnly(a).slice(0, 2000));" src/core/run-evidence.js || true)" 1 "A2 required expression"
need "$(grep -cF "  const scrub = (v) => redactOnly(String(v == null ? '' : v)).slice(0, 2000);" src/core/run-evidence.js || true)" 1 "A3 required expression"

# AC2 — no pre-cut form survives anywhere in src/.
need "$(grep -rcF "redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS))" src/ | grep -v ':0$' | wc -l | tr -d ' ')" 0 "A1 old expression gone"
need "$(grep -rcF "redactOnly(a.slice(0, 2000))"                                      src/ | grep -v ':0$' | wc -l | tr -d ' ')" 0 "A2 old expression gone"
need "$(grep -rcF "redactOnly(String(v == null ? '' : v).slice(0, 2000))"              src/ | grep -v ':0$' | wc -l | tr -d ' ')" 0 "A3 old expression gone"

# AC3 — the three converted probes, by exact name and exact assertion; the old
# names gone from the whole repo except this spec; DEFECT_MSG gone.
TAP="$(mktemp)"
for f in alerts run-evidence; do
  node --test --test-reporter=tap "tests/unit/$f.test.js" >>"$TAP" 2>&1 || true
done
while IFS= read -r n; do
  LINE="$(grep -F -- "- $n" "$TAP" || true)"
  need "$(printf '%s\n' "$LINE" | grep -c . || true)" 1 "probe present exactly once: $n"
  need "$(printf '%s\n' "$LINE" | grep -c '^not ok' || true)" 0 "probe passes: $n"
done <<'NAMES'
sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is redacted in alerts.jsonl
sink-probe: run-evidence — a labelled secret straddling the argv cap is redacted in run-evidence.jsonl
sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is redacted in run-evidence.jsonl
NAMES
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the two files"
need "$(grep -rcF 'KNOWN DEFECT WD-SINK-TRUNC-' tests/ src/ | grep -v ':0$' | wc -l | tr -d ' ')" 0 "old defect probe names gone"
need "$(grep -cF 'DEFECT_MSG' tests/unit/alerts.test.js tests/unit/run-evidence.test.js | grep -v ':0$' | wc -l | tr -d ' ')" 0 "DEFECT_MSG removed from both files"
for id in WD-SINK-TRUNC-ALERTS WD-SINK-TRUNC-RUNEV-ARGV WD-SINK-TRUNC-RUNEV-FIELD; do
  need "$(grep -rcF "LEAK_MSG('$id')" tests/unit/ | grep -v ':0$' | wc -l | tr -d ' ')" 1 "$id kept as a regression id"
done

# AC4 — the declaration files: the old pair gone, the new pair present, shaped,
# and carrying no probe bytes.
node - <<'JS'
const fs = require("node:fs");
let bad = 0;
for (const gone of ["tests/red-proofs/secret-sink-wiring-probes-alerts.proofs.json",
                    "tests/red-proofs/secret-sink-wiring-probes-run-evidence.proofs.json"]) {
  if (fs.existsSync(gone)) { console.log(`GATE FAIL: ${gone} still present`); bad++; }
  else console.log(`ok: ${gone} removed`);
}
const want = {
  "secret-sink-redact-before-truncate-alerts": { suite: "tests/unit/alerts.test.js", n: 1 },
  "secret-sink-redact-before-truncate-run-evidence": { suite: "tests/unit/run-evidence.test.js", n: 2 },
};
const NAMES = {
  "alerts-truncate-before-redact":
    "sink-probe: alerts — a labelled secret straddling MAX_FIELD_CHARS is redacted in alerts.jsonl",
  "run-evidence-argv-truncate-before-redact":
    "sink-probe: run-evidence — a labelled secret straddling the argv cap is redacted in run-evidence.jsonl",
  "run-evidence-field-truncate-before-redact":
    "sink-probe: run-evidence — a labelled secret straddling the scalar-field cap is redacted in run-evidence.jsonl",
};
for (const [name, w] of Object.entries(want)) {
  const p = `tests/red-proofs/${name}.proofs.json`;
  if (!fs.existsSync(p)) { console.log(`GATE FAIL: missing ${p}`); bad++; continue; }
  const raw = fs.readFileSync(p, "utf8");
  if (raw.includes("sk-ant-")) { console.log(`GATE FAIL: ${p} contains probe bytes`); bad++; }
  const d = JSON.parse(raw);
  if (d.suite !== w.suite) { console.log(`GATE FAIL: ${p} suite ${d.suite} !== ${w.suite}`); bad++; }
  if (!Array.isArray(d.proofs) || d.proofs.length !== w.n) {
    console.log(`GATE FAIL: ${p} has ${d.proofs && d.proofs.length} proofs, expected ${w.n}`); bad++;
  }
  for (const pr of d.proofs || []) {
    if (pr.wp !== "WP-secret-sink-redact-before-truncate") { console.log(`GATE FAIL: ${p}/${pr.id} wp=${pr.wp}`); bad++; }
    if (pr.replace === pr.find) { console.log(`GATE FAIL: ${p}/${pr.id} replace === find`); bad++; }
    if (!pr.replace.includes(pr.marker)) { console.log(`GATE FAIL: ${p}/${pr.id} replace lacks marker`); bad++; }
    if (pr.file.startsWith("tests/")) { console.log(`GATE FAIL: ${p}/${pr.id} mutates a test path`); bad++; }
    if (pr.occurrences !== 1) { console.log(`GATE FAIL: ${p}/${pr.id} occurrences !== 1`); bad++; }
    // Table B is the single source of the three names; the declaration mirrors it.
    if (!(pr.id in NAMES)) { console.log(`GATE FAIL: ${p}/${pr.id} is not a Table C id`); bad++; }
    else if (pr.expectRed[0].test[0] !== NAMES[pr.id]) {
      console.log(`GATE FAIL: ${p}/${pr.id} expectRed test name is not Table B verbatim`); bad++;
    }
    // find must be the SHIPPED text, i.e. it must occur in the mutated file.
    if (!fs.readFileSync(pr.file, "utf8").includes(pr.find)) {
      console.log(`GATE FAIL: ${p}/${pr.id} find does not occur in ${pr.file}`); bad++;
    }
  }
  console.log(`ok: ${p} — suite ${d.suite}, ${d.proofs.length} proof(s)`);
}
process.exit(bad ? 1 : 0);
JS

# AC8 — permission boundary.
need "$(git diff --name-only main... | grep -cvE '^(src/core/(alerts|run-evidence)\.js|tests/unit/(alerts|run-evidence)\.test\.js|tests/red-proofs/secret-sink-(wiring-probes|redact-before-truncate)-(alerts|run-evidence)\.proofs\.json|docs/specs/WP-secret-sink-redact-before-truncate\.md|docs/specs/logbook/.+\.md|package-lock\.json|memory/lessons/inbox\.md)$' || true)" 0 \
     "files outside the permission boundary"

npm run red-proofs    # AC4 — the bare unfiltered run; must exit 0
npm test              # AC5, AC6
npm run lint          # AC7
echo "ALL GATES PASSED"
```

Both-sides evidence, per `docs/runbooks/spec-authoring.md`, is required for every
new or changed check and pasted into the PR. C1–C3 supply it mechanically for the
three converted probes. For AC5's new oversized test and for every grep added
above, observe all three states and paste them: **absent** (the file or construct
missing → red), **compliant** (→ green) and **violating** (→ red).

## Out of scope (do NOT do these)

- Fixing, probing or mentioning as fixed any of the four `WD-SINK-CHUNK-*`
  defects — that is `WP-secret-sink-chunk-fix`.
- Any change to `src/core/secret-scan.js`, including `SCAN_MAX_BYTES` and the
  oversized marker.
- Any change to the EP2 / EP4 gates or their `findings.length > 0` condition.
- Touching `src/core/transcripts/index.js`, `src/core/dream/promote.js`,
  `src/cli/dream.js` or `src/cli/run-job.js`.
- Editing `docs/specs/done/WP-secret-sink-wiring-probes.md`. Its Table P rows for
  P2, P4 and P6 become stale here and are corrected in one dated block by
  `WP-secret-sink-chunk-fix`, once all seven have moved. Record the three flips
  in a `docs/specs/logbook/` entry instead.
- Converting, renaming or re-messaging any probe other than Table B's three.
- Adding a shared helper, a new constant or a new test harness module.

## Dispatch precondition — owner items

One item. **It was not ruled on directly.** It is **a recommendation adopted
under standing authorization, not a direct ruling** — the standing process is
recorded in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`
("Owner items inside those packages"), carried forward from
`2026-09-05-owner-rulings-git-env-pinning-queue.md`: the architect records a
recommendation with the cost of overruling it, the session may dispatch under it,
and **the owner reverses it by dated amendment.** Nothing in this repo records
the owner approving, accepting or ratifying it, and this spec asserts no such
acceptance.

1. **Should a field larger than the detector's scan bound keep its first 2000
   characters, or become the oversized marker?**
   *Recommendation: the oversized marker.* Scanning first is what removes the
   leak, and the detector's own fail-closed behaviour above 262144 bytes is the
   only branch left; making the sink fall back to a pre-cut above that size hands
   a caller who controls field length a switch that selects the pre-fix leak.
   *Cost of overruling:* an alert `reason` or an `execPath` over 262144 bytes
   stops being readable in `wienerdog alerts` and in the digest banner, replaced
   by one fixed sentence. No such value has been observed; the sizes these fields
   carry today are error messages and paths.

## Definition of done

1. **DISPATCH PRECONDITION.** (a) The owner item above travels with this package
   as a **recommendation adopted under standing authorization**; a reversal is
   applied by a committed revision of this spec, never by a dispatch message,
   because `scripts/boundary-check.js` reads the Deliverables table in this file.
   (b) **THE DESIGN GATE IS CLOSED, at round 3, 2026-09-18**
   (`docs/runbooks/codex-review.md`), which is what makes this spec `Ready`.
   Rounds 1 and 2 landed HEAVY product findings and round 3 landed one LIGHT
   verification-machinery finding, all accepted in full and none dispositioned
   away; each round's raw reviewer output was committed **before** adjudication
   — `efd7d619` (r1), `c2490b4a` (r2), `dd6fb9e0` (r3) — and the dispositions
   table is `docs/specs/logbook/2026-09-18-secret-sink-fix-design-review.md`.
   **A closed design gate is a review gate, not owner approval**: the owner
   items below stay open in the standing form, and nothing in this repo records
   the owner approving, accepting or ratifying any of them or ADR-0043.
   (c) **THE DISPATCHER RE-DERIVES EVERY CITATION.** They are pinned to `main` at
   **`08de2bc3`**; Table A's `CURRENT` line strings are what a dispatch
   must re-confirm by grep, because a sibling package landing in
   `src/core/alerts.js` or `src/core/run-evidence.js` would falsify them
   silently. Re-derive into a committed revision, not into a dispatch message.
   (d) Branch `wp/secret-sink-redact-before-truncate`.
2. All verification steps pass locally; output pasted into the PR body, including
   the bare unfiltered `npm run red-proofs`, `npm test` and `npm run lint`.
3. Conventional commits; PR titled
   `fix(secret-scan): scan the whole value before the field cap at the three truncate-then-redact sinks (WP-secret-sink-redact-before-truncate)`.
4. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. "Discovered issues" states plainly that the four
   `WD-SINK-CHUNK-*` defects are untouched and still open.
5. This spec's `status:` flipped to `In-Review` in the same PR.
6. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
