---
id: WP-secret-scan-baseline-oracle
title: Freeze the pre-change secret-detector baseline — oracle, corpus and measurement harness
status: Superseded
model: sonnet
size: M
depends_on: []
adrs: [ADR-0024, ADR-0031]
epic: secret-lifecycle
---

# WP-secret-scan-baseline-oracle: capture what today's detector does, before anyone changes it

> **SUPERSEDED 2026-07-25 — do not implement.** It froze a pre-change oracle, corpus and measurement harness so a successor could only add an after-column. Superseded because the fence it was freezing a before-column for no longer exists, and its corpus was built for rules the replacement deletes. The replacement solves the same anti-circularity problem more cheaply, by transcribing the today-column from a reviewed table on main into its test file. Its literal NEGATIVE/POSITIVE rows are salvage.
>
> Replaced by `WP-secret-fence-two-tier-detector` + `WP-secret-fence-ep2-redact-arm` under ADR-0034, which scopes the
> fence to **accidental credential persistence** and fixes the one rule that
> caused 100% of the destructive false positives. Narrative:
> `docs/specs/logbook/2026-07-25-secret-fence-destructive-false-positives.md`.
>
> Everything below this line is the superseded design, preserved unedited.

---

> **This WP changes no shipped behaviour.** It adds four files and one test
> file. `src/core/secret-scan.js` is **not** modified, no consumer module is
> modified, and no existing test is modified. Merging it makes nothing safer and
> nothing less safe; it makes the current behaviour *written down and
> executable* so the successor WP cannot silently move it.

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude/Codex sessions into the
user's markdown vault. Before anything is committed, every staged note passes
ADR-0024's **EP2 staged-output gate**: `src/core/dream/validate.js:934` calls the
ONE shared detector `scanAndRedact` (`src/core/secret-scan.js`) on the added
content and, if it returns **any** finding of **either** severity, reverts the
whole note. The same detector gates three digest sections at **EP4**
(`src/core/digest.js:506,521,543`) and sanitizes five other durable-output sinks
through `redactOnly`.

The detector has two layers. **Eighteen labelled rules** (private-key blocks,
provider prefixes, bearer headers, sensitive `key=value` assignments, JSON values
under a sensitive key) are precise and contextual. Behind them sits one
**context-free entropy pass**: any run of 24+ characters from `[A-Za-z0-9+/=]`
whose Shannon entropy is ≥ 3.5 bits/char is labelled `high-entropy` at
`quarantine` severity.

**That entropy pass is a live defect.** Measured against the maintainer's real
vault (178 notes): **100 of 178 notes (56.2%) contain at least one match and
would be reverted by EP2.** On **2026-07-24** the live dream reverted three
legitimate notes and, because the transcript ledger had already marked those
sessions processed, the content will not be regenerated. Replacing that pass is
the job of the successor WP, `WP-secret-fence-shape-and-context`. **This WP is
not that WP and must not touch the detector.**

**Why a separate package.** Four consecutive adversarial review rounds on the
successor spec kept hitting the same structural problem: its evidence is a
before/after table, and the *before* half was being written in the same branch,
by the same implementer, at the same time as the *after* half. A reviewer cannot
tell a correct "before" from one that was quietly regenerated to agree with a
wrong harness. This WP lands the entire *before* half on `main` first — the
frozen oracle, every literal test vector with its observed pre-change verdict,
and the measurement harness with its byte-exact pre-change output — under its own
review. After it merges, the successor WP can only add an *after* column; moving
a *before* number becomes a visible diff to a reviewed file on `main`.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process. It
adds two data fixtures, one offline script, one fixture of that script's output,
and one test file.

## Current state

`src/core/secret-scan.js` (242 lines, pure, zero deps). **Not modified by this
WP.**

**The exact source the oracle represents — record this, it is load-bearing.**
The oracle is a copy of a specific version of a specific file. If nobody writes
down *which* version, the oracle silently becomes a copy of nothing in
particular, and the successor WP can be compared against a detector that already
moved. So:

| Fact | Value |
|------|-------|
| commit | `53ba030` |
| `git hash-object src/core/secret-scan.js` | `eb273e19050037542c8beb441b8a320a3248b514` |
| `shasum -a 256 src/core/secret-scan.js` | `be54813a2602a78822e939663ab31c3eff16426148c81a9394c0afc821584167` |
| `sed -n '155,186p' src/core/secret-scan.js \| shasum -a 256` (the entropy-pass region the oracle copies) | `624aea5f9ec59d0a6f115c8378380dae25fe475bbb49c5cc5340bbc6d242e9c8` |

These four values are asserted by the verification gate, and
`WP-secret-fence-shape-and-context` is required to re-assert the **blob hash**
on its own pre-edit base before it changes a byte of the detector. That closes
the window in which the detector drifts after this WP merges but before the
successor starts.

The parts this WP copies or measures:

- `ScanLimits` (lines 21–25) `= { SCAN_MAX_BYTES: 256*1024, ENTROPY_MIN_LEN: 24,
  ENTROPY_MIN_BITS_PER_CHAR: 3.5 }`.
- `RULES` (lines 87–153) — the eighteen labelled rules.
- `const ENTROPY_CANDIDATE = new RegExp('[A-Za-z0-9+/=]{24,}', 'g')` (line 155).
  Its literal source text in the file is
  `` new RegExp(`[A-Za-z0-9+/=]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g') ``.
- `bitsPerChar(run)` (line 158) — Shannon entropy over the run.
- `entropyPass(text, add)` (line 180) — replaces every candidate whose
  `bitsPerChar` ≥ 3.5 with `[REDACTED:high-entropy]` and adds a `quarantine`
  finding.
- `scanAndRedact` (line 200) runs `RULES` first, then `entropyPass`, inside one
  `try`. Exports at line 242: `{ scanAndRedact, redactOnly, hasHardFinding,
  ScanLimits, SEVERITY }`.

The module can emit exactly **23** finding labels: `private-key`,
`anthropic-key`, `openai-key`, `aws-key`, `github-token`, `slack-token`,
`google-oauth`, `jwt`, `bearer-token`, `generic-secret`,
`aws_secret_access_key`, `aws_session_token`, `client_secret`, `refresh_token`,
`access_token`, `google-client-secret`, `google-refresh-token`,
`google-api-key`, `stripe-secret-key`, `stripe-key`, `high-entropy`,
`oversized`, `scan-error`. The longest is `aws_secret_access_key` (21
characters).

`npm test` is `node tests/run.js`, which spawns `node --test` with inherited
stdio. `npm run lint` is `node scripts/lint.js` (markdownlint-cli2 + shellcheck +
shfmt + frontmatter schema).

Nothing in `tests/` currently freezes the detector's output for a fixed corpus.
`tests/unit/secret-scan.test.js` exists and has spot-check tests; **this WP does
not modify it.**

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | tests/fixtures/secret-scan-legacy-entropy.js | the frozen **pre-change oracle**: a verbatim copy of today's `ENTROPY_CANDIDATE` + `bitsPerChar` + 3.5 floor, exporting `legacyEntropyFires(text) -> boolean`. Pure data + two functions, no `require` of `src/`. Complete source is in "Exact contracts" |
| create | tests/fixtures/secret-scan-corpus.js | the frozen corpus of **Table L**: literal inputs, `LABELLED_BASELINE`, the `LEGACY` verdict map, and the **four** documented generator functions (`delimiterClosure`, `delimiterReverse`, `delimiterInside`, `shortSegments`). `module.exports` only, no assertions, no `require` of `src/` |
| create | scripts/measure-entropy-arms.js | the deterministic synthetic measurement harness whose complete contract is **Table H**. Four modes: `--baseline` (default), `--passphrase`, `--uuid-forms`, `--perf`. Not run by `npm test` |
| create | tests/fixtures/measure-entropy-arms.baseline.txt | the byte-exact expected `--baseline` output for `SEED = 0x5eed1234`, `N = 20000`, copied verbatim from Table H. **Frozen: its content is a property of today's detector and must never change** |
| create | tests/unit/secret-scan-baseline.test.js | the characterization tests listed under "Acceptance criteria", **including the oracle↔detector differential of Table O**. Asserts today's behaviour only |

Per `docs/specs/_TEMPLATE.md` lines 30-31, this spec file and
`package-lock.json` are exempt from every Deliverables table and are therefore
not listed here, while remaining permitted in the verification whitelist below.

**Do not create, modify or delete anything else.** In particular: not
`src/core/secret-scan.js`, not `tests/unit/secret-scan.test.js`, not any
consumer module, not `docs/adr/0024-layered-secret-lifecycle.md`.

### Exact contracts

#### The frozen oracle — `tests/fixtures/secret-scan-legacy-entropy.js`

This is the whole file, verbatim. Copy it; do not re-derive it.

```js
'use strict';
// FROZEN pre-change oracle. Verbatim copy of src/core/secret-scan.js lines
// 155-186 as they stood before WP-secret-fence-shape-and-context. Never edit
// this to make a test pass; it is the definition of "what today's rule did".
const LEGACY_CANDIDATE = /[A-Za-z0-9+/=]{24,}/g;

/** Shannon entropy in bits per character over the run.
 *  @param {string} run @returns {number} */
function legacyBitsPerChar(run) {
  const freq = new Map();
  for (let i = 0; i < run.length; i += 1) freq.set(run[i], (freq.get(run[i]) || 0) + 1);
  let bits = 0;
  for (const n of freq.values()) {
    const p = n / run.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** @param {string} text @returns {boolean} did today's rule flag this input? */
function legacyEntropyFires(text) {
  LEGACY_CANDIDATE.lastIndex = 0;
  let m;
  while ((m = LEGACY_CANDIDATE.exec(text)) !== null) {
    if (legacyBitsPerChar(m[0]) >= 3.5) return true;
  }
  return false;
}

module.exports = { legacyEntropyFires, legacyBitsPerChar };
```

`LEGACY_CANDIDATE` carries the `g` flag and is module-scoped, so `lastIndex`
**must** be reset before each use — the code above does this. Removing that reset
makes the oracle intermittently skip content, which is the classic way to
corrupt a before/after table.

#### The corpus — `tests/fixtures/secret-scan-corpus.js`

Plain data. Exported shape, exactly:

```js
module.exports = {
  LABELLED_INPUTS,     // string[18]
  LABELLED_BASELINE,   // {text:string, findings:{label:string,severity:string,count:number}[]}[18]
  NEGATIVE,            // string[20]
  POSITIVE,            // {id:string, input:string}[23]
  SOFTENED,            // {id:string, cls:string, input:string}[9]
  BOUNDARY,            // {id:string, axis:string, input:string, len:number, bits:number}[31]
  PRECEDENCE,          // {id:string, pins:string, input:string}[13]
  RESIDUAL_FP,         // {id:string, residual:string, input:string}[3]
  LEGACY,              // {[id:string]: boolean} — the observed pre-change verdict
  delimiterClosure,    // () => string[95]
  delimiterReverse,    // () => string[5]
  delimiterInside,     // () => {id:string, input:string}[100]
  shortSegments,       // () => {id:string, input:string}[100]
};
```

`LEGACY` is keyed by the ids of `POSITIVE`, `SOFTENED`, `BOUNDARY`,
`PRECEDENCE` and `RESIDUAL_FP`, plus `neg-1` … `neg-20` for the `NEGATIVE`
rows in order. Its values are the `old` column of **Table L** and nothing else.

**`LABELLED_BASELINE` must be generated, not typed.** After writing
`LABELLED_INPUTS`, produce the expected values with

```bash
node -e '
const {scanAndRedact}=require("./src/core/secret-scan.js");
const {LABELLED_INPUTS}=require("./tests/fixtures/secret-scan-corpus.js");
console.log(JSON.stringify(LABELLED_INPUTS.map(scanAndRedact),null,2));'
```

and paste the output in as literal data. This is safe here precisely because
this WP does not touch the detector: the generator and the thing generated are
the same, unmodified module.

The four generator functions are pure and take no arguments. Their
constructions are given in Table L rows L-7, L-8, L-9 and L-10 and must be
copied from there verbatim — they exist as generators, not as literals, so that
they stay exhaustive when the delimiter set changes in the successor WP.

## Contract reference

Activation (ADR-0031, 3 of 7): (iii) this WP fixes the accepted input corpus that
later specs' acceptance is measured against; (vi) the successor WP and its review
loop inherit every literal here; (vii) the same facts appear in the fixture, in
the harness, in the gate and in this spec's tables.

Three canonical tables:

| Family | Canonical table | Nothing else decides it |
|--------|-----------------|-------------------------|
| the corpus and its pre-change verdicts | **Table L** | every literal input, every id, every `old` value |
| the measurement harness | **Table H** | PRNG, seed, alphabets, generators, contexts, loop order, output format, expected bytes |
| **what makes the oracle trustworthy** | **Table O** | the source blob it represents, the differential against the shipped detector, and the exemption set |

### A standing review lesson this WP is subject to

Three findings across three specs in this family have now been the same
failure: **evidence that validates only against itself.** Round 2's corpus was
generated by the harness it was meant to check; round 4's SHA gate hashed a
fixture the implementer had produced; and this WP's first review found the same
shape a third time — a frozen oracle whose correctness nothing compares against
anything outside itself. Treat it as a standing checklist item, not a one-off:

> **Before asserting that a piece of evidence is trustworthy, name the thing
> outside it that would disagree if it were wrong.** If nothing would, the
> evidence is self-consistent, not correct.

For this WP that outside thing is the **shipped detector**, and Table O is where
the comparison lives.

### Table L — canonical: the corpus and its observed pre-change verdicts

Every row was executed against `src/core/secret-scan.js` at commit `53ba030` on
2026-07-25. The `old` column is **observed**, not intended: it is
`legacyEntropyFires(input)` from the frozen oracle above.

**Reading the literal columns.** Inside these markdown tables `\|` is a markdown
escape for one `|` character, and `\n` means one real newline in the JavaScript
string. `<dot74>` / `<dot75>` mean exactly 74 / 75 `.` characters. Everything
else is byte-for-byte what the fixture must contain — no leading or trailing
whitespace, no smart quotes.

Sanitized reproductions only. **No verbatim sentence from the maintainer's notes
or transcripts appears anywhere in this corpus**, and none may be added.

#### L-1 — `LABELLED_INPUTS` (18)

One input per labelled rule, in the order the rules appear in `RULES`. Each must
be a *fake* credential shaped to match its rule; none may be a real credential.

| # | Label the input must trigger | Literal input |
|---|------------------------------|---------------|
| 1 | `private-key` | `-----BEGIN RSA PRIVATE KEY-----\nMIIBOgIBAAJBAK\n-----END RSA PRIVATE KEY-----` |
| 2 | `anthropic-key` | `key sk-ant-api03-PROBEaaaabbbbccccddddeeee here` |
| 3 | `openai-key` (proj) | `key sk-proj-PROBEaaaabbbbccccdddd here` |
| 4 | `openai-key` (bare) | `key sk-PROBEaaaabbbbccccddddeeee here` |
| 5 | `aws-key` | `id AKIAPROBE1234567890 here` |
| 6 | `github-token` | `tok ghp_PROBEaaaabbbbccccddddeeeeffffgggghhhh here` |
| 7 | `slack-token` | `tok xoxb-PROBE-1234-5678 here` |
| 8 | `google-oauth` | `tok ya29.PROBEaaaabbbbcccc here` |
| 9 | `jwt` | `tok eyJPROBEaaaabbbb.PROBEccccdddd.PROBEeeeeffff here` |
| 10 | `bearer-token` | `Authorization: Bearer PROBEaaaabbbbccccdddd` |
| 11 | `generic-secret` (legacy assignment) | `api_key=PROBEaaaabbbbcccc` |
| 12 | `client_secret` (JSON) | `{"client_secret":"PROBEaaaabbbbcccc"}` |
| 13 | `access_token` (JSON) | `{"access_token":"PROBEaaaabbbbcccc"}` |
| 14 | `aws_secret_access_key` (extended assignment) | `AWS_SECRET_ACCESS_KEY=PROBEaaaabbbbccccdddd` |
| 15 | `google-client-secret` | `sec GOCSPX-PROBEaaaabbbbcccc here` |
| 16 | `google-refresh-token` | `tok 1//0PROBEaaaabbbb here` |
| 17 | `google-api-key` | `key AIzaPROBEaaaabbbbccccddddeeeeffffgggg here` |
| 18 | `stripe-secret-key` | `key sk_live_PROBEaaaabbbb here` |

`LABELLED_BASELINE[i]` is the generated `scanAndRedact(LABELLED_INPUTS[i])`
result for each. If any input above fails to produce its stated label, that is a
**spec bug** — say so in the PR and stop; do not adjust the input to make a
different rule fire.

#### L-2 — `NEGATIVE` (20)

Vault-shaped inputs. This WP asserts only the `old` column for them; the
successor WP asserts that all 20 yield zero findings.

| # | Literal input | old |
|---|---------------|-----|
| 1 | `see [[01-Projects/wienerdog/current-state]] for detail` | **true** |
| 2 | `the note lives at 03-Resources/claude-code-keychain-auth for now` | false |
| 3 | `env order is WIENERDOG_HOME+HOME+CLAUDE_CONFIG_DIR+CODEX_HOME today` | false |
| 4 | `export lands in debug_data/ReportHistory-62115843_Apr19 nightly` | false |
| 5 | `call generateCodeVerifierAsync before the redirect` | **true** |
| 6 | `session 019f819d-6aea-7950-b28e-9f26b7718c08 resumed` | false |
| 7 | `session 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c closed` | false |
| 8 | `daily note 05-Daily/2026/07/2026-07-24-morning-review saved` | false |
| 9 | `spec docs/specs/WP-secret-fence-shape-and-context.md updated` | false |
| 10 | `threshold ENTROPY_HEX_MIN_BITS stays where it is` | false |
| 11 | `script koltsegvetes/analysis/scripts/fetch_kettopera_sheet ran` | **true** |
| 12 | `source https://www.example.gov/releases/consumerpriceinflationukjuly2025` | **true** |
| 13 | `moved to [[02-Areas/second-brain/inbox-triage-routine]] instead` | false |
| 14 | `config deployment/daemon/trading_daemon_configuration reloaded` | **true** |
| 15 | `binary /opt/homebrew/bin/example-cli --profile default works` | **true** |
| 16 | `versions under local/share/example-app/versions/2026-07-24 pruned` | false |
| 17 | `see Documentation=RepositoryConfiguration end` | **true** |
| 18 | `plan is Documentation+RepositoryConfiguration today` | **true** |
| 19 | `the constant ABCDEFGHABCDEFGHABCDEFGHABCDEFGH appears in prose` | false |
| 20 | `json {"uuid":"b593bdb9-a85e-431b-b9fe-8f564994c09b","tokens":20685}` | false |

**8 of the 20 fire under today's rule** (rows 1, 5, 11, 12, 14, 15, 17, 18).
That count is asserted by the gate.

#### L-3 — `POSITIVE` (23)

Every one of these fires under today's rule; `LEGACY[id] === true` for all 23,
and the gate asserts that count.

| Id | Literal input |
|----|---------------|
| `pos-hex-32` | `blob 7f3a9c1e5b8d2406af71c39e5d8b204c end` |
| `pos-hex-40` | `blob 9c2f71a4e83b06d5192c7fa3e6b58d04c71e39a2 end` |
| `pos-hex-64` | `blob 4e91c3a7f2058bd6194ea73c85f20db69c31a8e47f025bd93ca61e78f4b20d95 end` |
| `pos-base32-32` | `blob K7QM3ZVX2TJRWY6BN4HGS5PCLD2AF7QE end` |
| `pos-alnum-32` | `blob 5NQywwNzM016QPy4x27M6z7310P3x524 end` |
| `pos-alnum-40` | `blob 7pQz3XmK9wR2vN6tJ4hB8yG5cF1dS0aL3eU7iO2M end` |
| `pos-b64-32` | `blob Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEy end` |
| `pos-b64-44-pad` | `blob aGVsbG93b3JsZDEyMzQ1Njc4OTBhYmNkZWZnaGlqaz0= end` |
| `pos-b64url-43` | `blob q7PmXz4KvR9tWc2LbN8dYfGh-JkL0pQrStUvWxYz3A1 end` |
| `pos-aws-secret-shape` | `blob wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY end` |
| `pos-suffixed` | `that-7f3a9c1e5b8d2406af71c39e5d8b204c-foo` |
| `pos-filename` | `notes/7f3a9c1e5b8d2406af71c39e5d8b204c.md` |
| `pos-query` | `https://app.example/cb?code=Zm9vYmFyYmF6cXV4MTIzNDU2Nzg5MDEy&state=1` |
| `pos-dsn` | `postgres://u:7CxK2mQv9RtZ4pLw8sNb3hJf6dGy1aUe@db.example:5432/app` |
| `pos-kw-before` | `the api key is q7PmXz4KvR9tWc2LbN8dYfGh here` |
| `pos-kw-after` | `q7PmXz4KvR9tWc2LbN8dYfGh is the API key` |
| `pos-kw-tablerow` | `\| token \| q7PmXz4KvR9tWc2LbN8dYfGh \| active \|` |
| `pos-kw-heading` | `## Rotating the signature\n\nnote\n\nq7PmXz4KvR9tWc2LbN8dYfGh` |
| `pos-kw-base32-26` | `the shared secret is K7QM3ZVX2TJRWY6BN4HGS5PCLD now` |
| `pos-kw-b64url-32` | `cookie value q7PmXz4KvR9tWc2LbN8dYfGh-JkL0pQr set` |
| `pos-plus-embedded` | `abcdefghijklmnopqrstuvwxyzabcdefg+5NQywwNzM016QPy4x27M6z7310P3x524` |
| `pos-eq-embedded` | `abcdefghijklmnopqrstuvwxyzabcdefg=5NQywwNzM016QPy4x27M6z7310P3x524` |
| `pos-plus-inside` | `abcdefghijklmnopqrstuvwxyzabcdefg+5NQywwNzM016QPy+x27M6z7310P3x524` |

`pos-plus-inside` is the round-4 critical vector: a 32-character credential that
**itself contains a canonical delimiter**, glued behind a 33-character
word-shaped prefix. It differs from `pos-plus-embedded` by one character — the
`4` at offset 49 of the credential becomes `+` — and that one character is the
whole finding. Do not merge, reorder or "simplify" the two.

#### L-4 — `SOFTENED` (9)

All nine fire under today's rule (`LEGACY[id] === true`), which is what makes
them softenings in the successor WP.

| Id | Class | Literal input |
|----|-------|---------------|
| `sft-s1-alnum-24` | S1 | `blob q7PmXz4KvR9tWc2LbN8dYfGh end` |
| `sft-s1-b64-31` | S1 | `blob q7PmXz4KvR9tWc2LbN8dYfGhJkL0pQ end` |
| `sft-s1-base32-26` | S1 | `blob K7QM3ZVX2TJRWY6BN4HGS5PCLD end` |
| `sft-s1-hex-24` | S1 | `blob 7f3a9c1e5b8d2406af71c39e end` |
| `sft-s2-passphrase-bare` | S2-b | `CorrectHorseBatteryStaple2024` |
| `sft-s2-passphrase-prose` | S2-b | `My password is CorrectHorseBatteryStaple2024 ok` |
| `sft-s2-camel-identifier` | S2 | `call generateCodeVerifierAsyncHandler now` |
| `sft-s2-lowercase-32` | S2-c | `source consumerpriceinflationukjuly2025 today` |
| `sft-s2-eq-word-pair` | S2-d | `see Documentation=RepositoryConfiguration end` |

#### L-5 — `BOUNDARY` (31)

`len` and `bits` are the measured length and Shannon entropy of the *token* the
row probes (not of the whole input), recorded so the boundary being probed is
unambiguous.

| Id | Axis probed | Literal input | len | bits | old |
|----|-------------|---------------|-----|------|-----|
| `bnd-len-23-kw` | P5 length, below | `the api key is 3QPQz5w011y4xN63z22P40y ok` | 23 | 3.7410 | false |
| `bnd-len-24-kw` | P5 length, at | `the api key is 6Pzz223Q4yQ0x354N1x0w1Py ok` | 24 | 3.7516 | true |
| `bnd-len-25-kw` | P5 length, above | `the api key is 00P3612NQ2z3xPxy4Qy14wz55 ok` | 25 | 3.7639 | true |
| `bnd-len-31-bare` | P4 length, below | `blob 2wzx634QN7xQP8z13w56yPy20MN0154 end` | 31 | 4.0510 | true |
| `bnd-len-32-bare` | P4 length, at | `blob 5NQywwNzM016QPy4x27M6z7310P3x524 end` | 32 | 4.0000 | true |
| `bnd-len-33-bare` | P4 length, above | `blob 3MPN21yP17470Qx65zyxN5w4206z03wQM end` | 33 | 3.9912 | true |
| `bnd-hexlen-31` | P1 length, below | `blob 4571653072152100526673432140436 end` | 31 | 2.9944 | false |
| `bnd-hexlen-32` | P1 length, at | `blob 16072524644332513510714076532067 end` | 32 | 3.0000 | false |
| `bnd-hexlen-33` | P1 length, above | `blob 643174621346845700257512703253016 end` | 33 | 3.1050 | false |
| `bnd-hexbits-below` | P1 bits, below 3.0 | `blob 34136012640523005424235261316105 end` | 32 | 2.7988 | false |
| `bnd-hexbits-at` | P1 bits, exactly 3.0 | `blob 16072524644332513510714076532067 end` | 32 | 3.0000 | false |
| `bnd-hexbits-above` | P1 bits, above 3.0 | `blob 36645723054411570342527801636102 end` | 32 | 3.1014 | false |
| `bnd-bits-below` | P4 bits, below 3.5 | `blob 51P1z4zPQxz3425Q4y320Qy0y021xP3x end` | 32 | 3.4516 | false |
| `bnd-bits-at` | P4 bits, exactly 3.5 | `blob 0322Q2z1P1y0Q0w2zQzyyQ04xNy11z65 end` | 32 | 3.5000 | true |
| `bnd-bits-above` | P4 bits, above 3.5 | `blob 2QPNNPz23z05zyy1x10x345Q0P2Q314y end` | 32 | 3.5613 | true |
| `bnd-ctxbits-below` | P5 bits, below 3.5 | `the api key is 202y1yQP40PQ4zz0z13231yQ ok` | 24 | 3.1462 | false |
| `bnd-ctxbits-above` | P5 bits, above 3.5 | `the api key is 3zN5Px026xQy413P0yz2w4Q1 ok` | 24 | 3.7516 | true |
| `bnd-win-before-74` | window, before, last accepted | `secret<dot74>6Pzz223Q4yQ0x354N1x0w1Py` | 24 | 3.7516 | true |
| `bnd-win-before-75` | window, before, first rejected | `secret<dot75>6Pzz223Q4yQ0x354N1x0w1Py` | 24 | 3.7516 | true |
| `bnd-win-after-74` | window, after, last accepted | `6Pzz223Q4yQ0x354N1x0w1Py<dot74>secret` | 24 | 3.7516 | true |
| `bnd-win-after-75` | window, after, first rejected | `6Pzz223Q4yQ0x354N1x0w1Py<dot75>secret` | 24 | 3.7516 | true |
| `bnd-cover-half` | P3 coverage exactly ½ | `abcdefghijklmnop-5NQywwNzM016QPy` | 32 | — | false |
| `bnd-cover-under` | P3 coverage one char under ½ | `abcdefghijklmno-5NQywwNzM016QPy4` | 32 | — | false |
| `bnd-lowent-a40` | entropy floor, zero entropy | `padding aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa end` | 40 | 0.0000 | false |
| `bnd-lowent-abc60` | entropy floor, low entropy | `padding abcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabcabc end` | 60 | 1.5850 | false |
| `bnd-lowent-deadbeef` | entropy floor, mid-low | `padding deadbeefdeadbeefdeadbeefdeadbeefdeadbeef end` | 40 | 2.1556 | false |
| `bnd-reentrancy` | replacement tokens | `[REDACTED:aws_secret_access_key] [REDACTED:high-entropy] [REDACTED:generic-secret]` | 21 | 3.0823 | false |
| `bnd-b32-bits-below` | P1b bits, below 3.5 | `blob ABCDEFGHABCDEFGHABCDEFGHABCDEFGH end` | 32 | 3.0000 | false |
| `bnd-b32-bits-at` | P1b bits, at maximum | `blob ABCDEFGHIJKLMNOPQRSTUVWXYZ234567 end` | 32 | 5.0000 | true |
| `bnd-b32-len-31` | P1b length, below | `blob K7QM3ZVX2TJRWY6BN4HGS5PCLD2AF7Q end` | 31 | 4.7606 | true |
| `bnd-b32-len-32` | P1b length, at | `blob K7QM3ZVX2TJRWY6BN4HGS5PCLD2AF7QE end` | 32 | 4.8125 | true |

`bnd-hexlen-32` and `bnd-hexbits-at` deliberately share one literal input: hex-32
at exactly 3.0000 bits is simultaneously the "at" case on the length axis and on
the bits axis. Both ids exist so a dropped axis is visible in the count.

`bnd-lowent-a40` and `bnd-lowent-abc60` are exactly the two runs inside the
pre-existing test at `tests/unit/secret-scan.test.js:186`. That test is **not**
touched by this WP.

**Count of `true` in the `old` column of `BOUNDARY`: 15.** Asserted by the gate.

#### L-6 — `PRECEDENCE` (13) and `RESIDUAL_FP` (3)

| Id | What it will pin in the successor WP | Literal input | old |
|----|--------------------------------------|---------------|-----|
| `prec-p1-over-p3-bare` | a structured arm beats the benign-shape suppressor | `abcdefabcdefabcdefabcd9876543210` | true |
| `prec-p1-over-p3-nested` | same, on a nested segment | `that-abcdefabcdefabcdefabcd9876543210-foo` | true |
| `prec-p3-denominator` | delimiter padding cannot buy suppression | `Documentationsegment-_-_-_-_-_-_-_-_-_-_6Pzz223Q4yQ0x354N1x0w` | false |
| `prec-p2-uuid-v7` | a canonical UUID is suppressed | `session 019f819d-6aea-7950-b28e-9f26b7718c08 resumed` | false |
| `prec-p2-canonical-only` | a non-canonical UUID shape is not | `blob 3f8a1c2b-9d4e-0a6f-2b7c-1e2d3f4a5b6c end` | false |
| `prec-p2-assign-override` | direct assignment beats UUID suppression | `authorization: 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c` | false |
| `prec-p2-keyword-not-enough` | mere keyword proximity does not | `"uuid":"b593bdb9-a85e-431b-b9fe-8f564994c09b","tokens":20685` | false |
| `prec-p2-session-prose` | a bare/prose canonical UUID stays suppressed | `the session token flow used 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c today` | false |
| `prec-p2-subgroup-not-a-candidate` | no fragment of a canonical UUID is a candidate either | `the token used 3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c ok` | false |
| `prec-p1-b32-not-over-uppercase` | uppercase prose is not a base32 credential | `the constant ABCDEFGHABCDEFGHABCDEFGHABCDEFGH in prose` | false |
| `prec-a7-nested-bare` | a benign outer token does not veto a nested credential | `Documentation-Repository-Configuration-5NQywwNzM016QPy4x27M6z7310P3x524` | true |
| `prec-a9-merge` | overlapping accepted regions merge into one finding | `0123456789abcdef0123456789abcdef-foo` | true |
| `prec-superset-tier1` | the legacy candidate set stays covered beyond any grouping bound | `abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrst-5N/Qy/wN/zM/01/6Q/Py/4x/27/M6/z7/31/0P/3x/524` | true |
| `res-hex-32-lowbits` | accepted residual: hex-32 in the 3.0–3.5 band | `blob 16072524644332513510714076532067 end` | false |
| `res-uuid-noncanon` | accepted residual: a non-canonical UUID-shaped document id | `frontmatter document_id: 7f3a9c1e-5b8d-0406-2f71-c39e5d8b204c ok` | false |
| `res-path-tail-33` | accepted residual: a path fragment with a random tail | `path packaging/build-r4t7y21m9k3v6x8qz cached` | false |

`prec-superset-tier1`'s input is 92 characters: a 46-character lowercase run, a
`-`, then a 45-character legacy candidate made of fifteen 2-character
slash-separated pieces. Both halves matter — the 46-character prefix is what
makes the whole run word-shaped, and fifteen pieces is what puts the legacy
candidate out of reach of any bounded grouping. Do not shorten either.

`res-uuid-noncanon`'s UUID is **synthesized** to have a non-canonical nibble
structure (version nibble `0`, variant nibble `2`); no identifier from any
private corpus is copied into the repository.

**Count of `true` in the `old` column across `PRECEDENCE` + `RESIDUAL_FP`: 5.**
Asserted by the gate.

#### L-7 — `delimiterClosure()` → 95 strings

For **every** printable-ASCII character `c` (codes 32–126, 95 cases), in code
order:

```text
'abcdefghijklmnopqrstuvwxyzabcdefg' + c + '5NQywwNzM016QPy4x27M6z7310P3x524'
```

A 33-character word-shaped prefix (exactly half the coverage of the 66-character
whole) glued to a 32-character 4.0000-bit blob. **Measured: today's rule fires on
95 of 95.** Asserted by the gate.

**Known limitation, stated so it is not reintroduced.** This family cannot
detect the failure mode that `pos-plus-inside` covers, because its embedded blob
is itself **delimiter-free**: the family varies the *joining* character and holds
the credential constant, so an extractor that shreds a credential *at its own
internal delimiters* passes all 95 cases. That gap is the reason `delimiterInside`
(L-9) exists.

#### L-8 — `delimiterReverse()` → 5 strings

For each of the five characters `-` `_` `/` `=` `+`, in that order:

```text
'see Documentation' + c + 'RepositoryConfiguration end'
```

Measured under today's rule: `-` false, `_` false, `/` **true**, `=` **true**,
`+` **true**. **Count of `true`: 3.** Asserted by the gate.

#### L-9 — `delimiterInside()` → 100 `{id, input}` records

**The delimiter is inside the credential.** Cross product, iterated in exactly
this nesting order (delimiter, then position, then context), giving 5 × 5 × 4 =
100 records with id `din-<delim-name>-<position>-<context>`:

```js
const BLOB = '5NQywwNzM016QPy4x27M6z7310P3x524';                 // 32 chars, 4.0000 bits
const WORD = 'abcdefghijklmnopqrstuvwxyzabcdefg';                 // 33 chars, word-shaped
const DELIMS = [['dash','-'],['underscore','_'],['slash','/'],['equals','='],['plus','+']];
const POSITIONS = [
  ['leading',    (d) => d + BLOB],
  ['trailing',   (d) => BLOB + d],
  ['doubled',    (d) => BLOB.slice(0, 16) + d + d + BLOB.slice(16)],
  ['internal-1', (d) => BLOB.slice(0, 16) + d + BLOB.slice(16)],
  ['internal-3', (d) => BLOB.slice(0, 8) + d + BLOB.slice(8, 16) + d + BLOB.slice(16, 24) + d + BLOB.slice(24)],
];
const CONTEXTS = [
  ['bare',   (cred, d) => cred],
  ['prefix', (cred, d) => WORD + d + cred],
  ['suffix', (cred, d) => cred + d + WORD],
  ['both',   (cred, d) => WORD + d + cred + d + WORD],
];
```

**Measured under today's rule: 94 of 100 fire.** The six that do not are exactly
the `-` and `_` cases in the `bare` context at positions `doubled`,
`internal-1` and `internal-3` — today's candidate alphabet excludes `-` and `_`,
so those credentials are shredded into sub-24-character fragments with nothing
around them to make a longer run. Their ids are:

```text
din-dash-doubled-bare        din-dash-internal-1-bare        din-dash-internal-3-bare
din-underscore-doubled-bare  din-underscore-internal-1-bare  din-underscore-internal-3-bare
```

**Count of `true`: 94**, and the six false ids above, are both asserted by the
gate.

#### L-10 — `shortSegments()` → 100 `{id, input}` records

**The credential is made of many short pieces.** This family exists because
`delimiterInside` (L-9) holds the *number* of pieces at five or fewer, so it
cannot see the failure mode where a credential has so many short pieces that a
segment-count-bounded extractor never reaches the length floor on any of them.
That is the round-5 critical, and it is what this family pins.

Cross product, iterated in exactly this nesting order (delimiter, then piece
count, then context), giving 5 × 4 × 5 = 100 records with id
`seg-<delim-name>-<count>-<context>`:

```js
const SHORT = ['a1B','c2D','e3F','g4H','i5J','k6L','m7N','o8P','q9R','s0T','u1V','w2X'];
const WORD49 = 'documentationrepositoryconfigurationsomethinglong'; // 49 chars, word-shaped
const DELIMS = [['dash','-'],['underscore','_'],['slash','/'],['equals','='],['plus','+']];
const COUNTS = [8, 9, 10, 12];                     // credential lengths 31 / 35 / 39 / 47
const CONTEXTS = [
  ['bare',    (cred, d) => cred],
  ['prefix',  (cred, d) => WORD49 + d + cred],
  ['suffix',  (cred, d) => cred + d + WORD49],
  ['both',    (cred, d) => WORD49 + d + cred + d + WORD49],
  ['keyword', (cred, d) => `the api key is ${cred} ok`],
];
// cred = SHORT.slice(0, count).join(d)
```

**Measured under today's rule: 84 of 100 fire.** The sixteen that do not are
exactly the `dash` and `underscore` cases in the `bare` and `keyword` contexts —
today's candidate alphabet excludes `-` and `_`, so those credentials are shredded
into 3-character fragments with no surrounding run to lengthen them. Their ids
are the eight `seg-dash-{8,9,10,12}-{bare,keyword}` and the eight
`seg-underscore-{8,9,10,12}-{bare,keyword}`.

**Count of `true`: 84**, and the sixteen false ids, are both asserted by the
gate. Do not shorten `WORD49`, do not change `SHORT`'s piece length from 3, and
do not drop `count = 8` — 8 pieces is 31 characters, one below the successor
WP's bare-length floor, and it is the row that pins where the disclosed
softening starts.

### Table O — canonical: what makes the frozen oracle trustworthy

**This table is the single source of truth for the oracle's provenance and for
the differential that checks it.** Nothing else decides what the oracle is a copy
of, or what would catch it being wrong.

The oracle's whole value is that it is *independent* of `src/`: it does not
`require` the detector, so a later edit to the detector cannot change what
"today's rule did" means. That independence is also its danger. A mistranscribed
character class or a wrong floor produces an oracle that is wrong, a `LEGACY`
map generated from that wrong oracle, a fixture that agrees with the map, a
digest of that fixture, and a gate that passes — a completely self-consistent
lie. Nothing in the WP as first drafted would have noticed.

| # | Rule | Definition |
|---|------|-----------|
| O1 | the recorded source | the oracle is a copy of the entropy-pass region of `src/core/secret-scan.js` at the commit, blob hash and digests recorded in "Current state". The gate re-asserts all four |
| O2 | **the differential** | for **every** input in the corpus and in all four generators, `legacyEntropyFires(input)` must equal `scanAndRedact(input).findings.some(f => f.label === 'high-entropy')` — the *shipped* detector's own high-entropy behaviour. This is the outside thing that disagrees if the oracle is wrong |
| O3 | the exemption | O2 does not hold universally, and the exception is precise: when a **labelled rule** replaces a run before the entropy pass sees it, the shipped detector reports the labelled finding instead. Example, verified: `api_key=5NQywwNzM016QPy4x27M6z7310P3x524` → oracle `true`, shipped labels `generic-secret`, no `high-entropy`. A row is exempt from O2 **iff** `scanAndRedact(input).findings` contains a finding whose label is not `high-entropy` |
| O4 | **the exemption set is empty** | measured over all **399** inputs (20 `NEGATIVE` + 23 `POSITIVE` + 9 `SOFTENED` + 31 `BOUNDARY` + 13 `PRECEDENCE` + 3 `RESIDUAL_FP` + 95 closure + 5 reverse + 100 inside + 100 short): **0 rows are exempt and 0 disagree.** The gate asserts both numbers. `LABELLED_INPUTS` is deliberately outside O2's scope — those 18 exist to pin the labelled pipeline and are covered by `LABELLED_BASELINE` instead |
| O5 | the successor's obligation | `WP-secret-fence-shape-and-context` must assert `git hash-object src/core/secret-scan.js == eb273e19050037542c8beb441b8a320a3248b514` on its **pre-edit base** before changing the detector. If the detector moved between the two WPs, the successor's `old` column is stale and the whole before/after argument is void. That assertion is in the successor's gate, not here — but it is *this* WP's blob hash, so it is recorded here |

O4's "0 disagreements over 399 inputs" is the assertion that would have caught a
mistranscribed oracle. It is cheap, it is exact, and it runs at merge time.

### Table H — canonical: `scripts/measure-entropy-arms.js`

**This table is the single source of truth for the harness.** Everything a
reimplementation could vary is pinned; the gate asserts **exact** values, not
bounds.

Zero dependencies, pure Node, no network, no filesystem writes, not run by
`npm test`. It `require`s `tests/fixtures/secret-scan-legacy-entropy.js` for the
oracle side and `src/core/secret-scan.js` for the detector side. It reads
`process.argv` — it is a script, not part of `src/`. Runtime at the default N is
≈ 12 s for `--baseline`.

**PRNG — copy verbatim.** One instance, created at the start of each generator
row and consumed in the fixed order below. No `crypto`, no `Math.random`.

```js
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}
```

`SEED = 0x5eed1234`. Default `N = 20000`, overridable with `--n=<int>`. Modes:
`--baseline` (the default when no mode flag is given), `--passphrase`,
`--uuid-forms`, `--perf`.

**Alphabets — exact strings.**

| Name | Value |
|------|-------|
| `HEX` | `0123456789abcdef` |
| `B32` | `ABCDEFGHIJKLMNOPQRSTUVWXYZ234567` |
| `ALNUM` | `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789` |
| `B64C` | `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/` |

`chars(rng, al, n)` draws `n` characters as `al[Math.floor(rng() * al.length)]`.
`bytes(rng, n)` fills an `n`-byte Buffer with `Math.floor(rng() * 256)`.

**Generators — exact list and order.** A `-<k>B` generator draws `k` bytes and
encodes them; every other generator draws characters directly.

| Row | Construction |
|-----|--------------|
| `hex-24` `hex-32` `hex-40` `hex-64` | `chars(rng, HEX, <n>)` |
| `base32-26` `base32-32` `base32-52` | `chars(rng, B32, <n>)` |
| `alnum-24` `alnum-32` `alnum-40` `alnum-64` | `chars(rng, ALNUM, <n>)` |
| `b64-16B` `b64-24B` `b64-32B` | `bytes(rng, <k>).toString('base64')` |
| `b64url-24B` `b64url-32B` `b64url-64B` | `bytes(rng, <k>).toString('base64url')` |
| `aws-40` | `chars(rng, B64C, 40)` |
| `driveid-44` | `'1' + bytes(rng, 33).toString('base64url').slice(1)` |

`driveid-44` is the **19th and last** generator and it is deliberately shaped:
33 bytes base64url-encode to exactly 44 characters with no padding, and the
leading character is forced to `1`. That is the shape of a Google Drive file id,
and it is the shape behind the recurring false quarantine the successor WP calls
residual **R1**. It is a *generator*, not an allowlist: its purpose is to let
anyone measure what a real credential of that shape costs before proposing to
suppress the shape. Measured under today's rule it fires at **75.78%** bare —
i.e. today's detector already quarantines three of every four such ids.

**Contexts — exact templates and order:** `bare` `blob <t> end`; `keyword`
`the api key is <t> ok`; `suffixed` `that-<t>-foo`; `filename` `notes/<t>.md`;
`query` `https://app.example/cb?code=<t>&state=1`; `dsn`
`postgres://u:<t>@db.example:5432/app`.

**Loop order** (this fixes the PRNG draw sequence): for each generator, a fresh
`makeRng(SEED)`; then `for i in 0..N-1` draw one token, accumulate its length and
bits, then evaluate the six contexts in order.

#### `--baseline` — the frozen pre-change table

Columns: `generator`, `len`, `minBits` (3 decimals), `<3.0`, `<3.5`, `<4.5`
(counts of samples whose token entropy is below that many bits/char), then one
`<context>:old` column per context (percentage to 2 decimals of samples for which
`legacyEntropyFires` is true).

**This output is a property of today's detector alone and must never change.**
It is checked in as `tests/fixtures/measure-entropy-arms.baseline.txt`: line 1
`N = 20000`, line 2 the tab-separated header, then the 19 rows below,
tab-separated, `\n`-terminated, no trailing blank line.

| generator | len | minBits | <3.0 | <3.5 | <4.5 | bare:old | keyword:old | suffixed:old | filename:old | query:old | dsn:old |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hex-24 | 24 | 2.689 | 100 | 10925 | 20000 | 45.38 | 45.38 | 45.38 | 99.79 | 93.94 | 45.38 |
| hex-32 | 32 | 2.928 | 3 | 3757 | 20000 | 81.22 | 81.22 | 81.22 | 100.00 | 99.12 | 81.22 |
| hex-40 | 40 | 3.164 | 0 | 983 | 20000 | 95.08 | 95.08 | 95.08 | 100.00 | 99.86 | 95.08 |
| hex-64 | 64 | 3.351 | 0 | 8 | 20000 | 99.96 | 99.96 | 99.96 | 100.00 | 100.00 | 99.96 |
| base32-26 | 26 | 3.240 | 0 | 33 | 19995 | 99.83 | 99.83 | 99.83 | 100.00 | 100.00 | 99.83 |
| base32-32 | 32 | 3.504 | 0 | 0 | 19720 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| base32-52 | 52 | 4.007 | 0 | 0 | 9615 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-24 | 24 | 3.491 | 0 | 1 | 19014 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-32 | 32 | 3.929 | 0 | 0 | 6609 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-40 | 40 | 4.201 | 0 | 0 | 496 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| alnum-64 | 64 | 4.659 | 0 | 0 | 0 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64-16B | 24 | 3.518 | 0 | 0 | 19657 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64-24B | 32 | 3.926 | 0 | 0 | 6101 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64-32B | 44 | 4.317 | 0 | 0 | 28 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| b64url-24B | 32 | 3.926 | 0 | 0 | 6101 | 58.40 | 58.40 | 58.40 | 68.19 | 66.44 | 58.40 |
| b64url-32B | 43 | 4.257 | 0 | 0 | 75 | 74.33 | 74.33 | 74.33 | 83.34 | 82.51 | 74.33 |
| b64url-64B | 86 | 4.997 | 0 | 0 | 0 | 97.35 | 97.35 | 97.35 | 98.06 | 97.96 | 97.35 |
| aws-40 | 40 | 4.213 | 0 | 0 | 410 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 | 100.00 |
| driveid-44 | 44 | 4.237 | 0 | 0 | 62 | 75.78 | 75.78 | 75.78 | 84.37 | 83.50 | 75.78 |

SHA-256 of `tests/fixtures/measure-entropy-arms.baseline.txt`:

```text
2e86bfae3262282d7e6fc2ac076763760f2a1e90895ca5230e4925b3c65addae
```

*(The first 18 rows are byte-identical to the round-5 table; `driveid-44` is
purely additive, and the digest changed only because a row was appended.)*

**Why both a diff and a digest.** The gate diffs the harness's live output
against the checked-in fixture — that catches a drift with a readable per-row
failure. But if the implementer *generated* the fixture from their own harness,
that diff is circular: a wrong harness produces a wrong fixture and agrees with
itself. The digest breaks the circle, because it is a constant transcribed from
this spec into the gate. Assert both.

**Honest caveat, to be preserved in the script's header comment:** for generators
*shorter* than 32 characters the `suffixed` and `filename` columns are inflated
by the wrapper — `that-<24 chars>-foo` is itself a 33-character run, so a hit
there measures the wrapper, not the credential. Read those columns only from rows
with `len ≥ 32`.

#### `--passphrase`

Word source is a fixed 64-word list embedded in the script, in exactly this
order:

```text
Correct Horse Battery Staple Purple Monkey Dishwasher Anchor Bicycle Cactus
Diamond Ember Falcon Garden Harbor Island Jungle Kettle Lantern Meadow Nectar
Orbit Pepper Quartz River Summit Tunnel Velvet Walnut Yellow Zebra Amber Bronze
Copper Dagger Eagle Forest Granite Hammer Ivory Jasper Kernel Ladder Marble
Needle Onyx Pillar Quiver Ribbon Silver Timber Umber Violet Willow Xenon Yarrow
Zenith Almond Beacon Cinder Dolphin Element Fabric Glacier
```

One `makeRng(SEED)` for the whole mode. Each sample concatenates 4 words drawn
with `WORDS[Math.floor(rng()*64)]` then
`String(Math.floor(rng()*10000)).padStart(4,'0')`. Forms, in order: `bare` `<p>`;
`prose` `My password is <p> ok`; `assignment` `password=<p>`.

Each row prints two measurements: `entropy-old` (the frozen oracle) and
`gate-old` (`scanAndRedact(s).findings.length > 0` under the shipped detector).
The gate-level column exists because the passphrase mitigation **is** a labelled
rule, so an entropy-label-only measurement reads differently and misstates it.

Exact expected output — three tab-separated rows in this order, then a final
line, each printed with its literal column labels interleaved. **`\t` below
stands for one literal tab character; the file contains real tabs, not the
two-character sequence:**

```text
bare\tentropy-old\t99.31\tgate-old\t99.31
prose\tentropy-old\t99.31\tgate-old\t99.31
assignment\tentropy-old\t100.00\tgate-old\t100.00
meanlen\t28.0
```

#### `--uuid-forms`

Prints one line per form, `<form>\t<shipped>`, each value `yes`/`no` for
`scanAndRedact(s).findings.length > 0` under the shipped detector, using the
fixed UUID `3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c`. **Exactly eleven lines, in
this order and with these values** (again, `\t` stands for one literal tab):

```text
authorization-colon\tno
bearer-header\tyes
token-colon\tyes
token-equals\tyes
api_key-colon\tyes
secret-equals\tyes
password-colon\tyes
client_secret-json\tyes
x-api-key-colon\tyes
session-prose\tno
bare\tno
```

The eleven inputs, in order:

```text
authorization-colon   authorization: <U>
bearer-header         Authorization: Bearer <U>
token-colon           token: <U>
token-equals          token=<U>
api_key-colon         api_key: <U>
secret-equals         secret=<U>
password-colon        password: <U>
client_secret-json    "client_secret": "<U>"
x-api-key-colon       X-Api-Key: <U>
session-prose         the session token flow used <U> today
bare                  <U>
```

#### `--perf`

**Exactly eleven** tab-separated lines, one per bait, `<label>\t<bytes>\t<ms>`,
baits in this order, each at the 256 KiB `SCAN_MAX_BYTES` cap, each preceded by
a 1 KiB warm-up call, each timed as the **minimum of five** runs. `<bytes>` is
always `262144`.

| # | Bait | Construction |
|---|------|--------------|
| 1 | `one-long-run` | `'a'` × cap |
| 2 | `random-base64` | `crypto.randomBytes(196608).toString('base64')`, truncated to cap |
| 3 | `ab-dash-bait` | `'ab-'` repeated, truncated to cap |
| 4 | `camel-bait` | `'AbCd'` repeated, truncated to cap |
| 5 | `delimiter-padding` | `'-_/=+'` repeated, truncated to cap |
| 6 | `hex-run` | `'0123456789abcdef'` repeated, truncated to cap |
| 7 | `segment-dense-word` | `'abcd+efgh/ijkl=mnop-'` repeated, truncated to cap |
| 8 | `segment-dense-blob` | `'Zm9vYmFy+'` repeated, truncated to cap |
| 9 | `uuid-dense` | `'3f8a1c2b-9d4e-4a6f-8b7c-1e2d3f4a5b6c-'` repeated, truncated to cap |
| 10 | `segment-dense-nonword` | `'a1+'` repeated, truncated to cap |
| 11 | `segment-dense-short` | `'a1B+'` repeated, truncated to cap |

`crypto.randomBytes` is the **one** place a non-deterministic value is allowed,
because this mode measures time, not verdicts.

Baits 7–11 are delimiter-dense on purpose: they are the shapes whose cost the
successor WP's extractor changes, and they must be in the harness *before* that
WP so its "before" column is not self-reported. Baits 10 and 11 are the two
worst cases for a per-segment extractor — `'a1+'` produces the maximum number of
**non-word** segments per byte, which is precisely the input on which no
shape-based short-circuit helps. Observed under the shipped detector on the
maintainer's machine, 2026-07-25, minimum of five: 6.8 / 9.5 / 3.4 / 6.0 / 2.5 /
6.0 / 9.4 / 5.0 / 4.6 / 4.8 / 5.4 ms.

**The gate must parse this output strictly, and here is why.** A gate written as
`awk -F'\t' '{ if ($3+0 > BUDGET) fail }'` accepts a NaN, an empty field and a
negative number, because all three coerce to `0` — a harness that printed
garbage, or printed nothing at all for a bait, would pass. Verified by direct
test against the round-5 gate. The gate in "Verification steps" therefore:

- asserts **exactly eleven** lines and **exactly three** tab-separated fields per line;
- asserts the eleven labels are the ones above, **in that order**;
- asserts field 2 equals `262144` (`SCAN_MAX_BYTES`) on every line;
- asserts field 3 matches `^[0-9]+(\.[0-9]+)?$` — finite, non-negative, not empty,
  not `NaN`, not negative — **before** comparing it numerically;
- fails on any extra, missing or malformed row.

**The budget is 400 ms per bait, not 1500 ms.** Under today's detector every
bait is under 10 ms, so any small value would pass here; the constant is sized
for its real job in the successor WP, whose worst measured bait on the same
machine is **128.5 ms**. 400 ms is ~3.1× that — enough headroom for a slower box,
tight enough that an order-of-magnitude regression fails. The successor WP adds
a second, machine-independent gate (a ratio against the shipped detector), which
is the one that actually catches an algorithmic regression; this WP cannot have
that gate because it only ever times one detector.

### Mirrored Surface Checklist

Every surface below restates a fact owned by Table L or Table H. A review finding
updates the owning table **and** every mirror listed here in one pass; a new
mirror discovered in review is registered here on the spot.

Mirrors of **Table L** (corpus and pre-change verdicts):

- [ ] the Deliverables `Notes` cell for `tests/fixtures/secret-scan-corpus.js`
- [ ] the `module.exports` shape under "Exact contracts" (array lengths must match Table L's counts)
- [ ] the four generator-function constructions in the fixture (must be copied from L-7, L-8, L-9, L-10)
- [ ] every count in Acceptance criteria (18 / 20 / 23 / 9 / 31 / 13 / 3 / 95 / 5 / 100 / 100)
- [ ] every `old`-side count in the verification gate (8 NEGATIVE, 23 POSITIVE, 9 SOFTENED, 15 BOUNDARY, 5 PRECEDENCE+RESIDUAL, 95 closure, 3 reverse, 94 inside, 84 short)
- [ ] the six named `delimiterInside` legacy misses in L-9 and the sixteen named `shortSegments` legacy misses in L-10
- [ ] the "no verbatim maintainer text" statement in the Security checklist

Mirrors of **Table O** (oracle trustworthiness) — registered in round 6:

- [ ] the four source-blob values in "Current state"
- [ ] the Deliverables `Notes` cell for `tests/unit/secret-scan-baseline.test.js`
- [ ] the differential acceptance criterion (O2/O4)
- [ ] the gate's blob-hash and differential steps
- [ ] the Security-checklist item on oracle independence
- [ ] the successor WP's pre-edit blob assertion (O5) — lives in that WP's gate, mirrored here
- [ ] the "standing review lesson" section under Contract reference

Mirrors of **Table H** (harness):

- [ ] the Deliverables `Notes` cells for `scripts/measure-entropy-arms.js` and its baseline fixture
- [ ] the script's header comment (must carry the `len ≥ 32` caveat verbatim)
- [ ] `tests/fixtures/measure-entropy-arms.baseline.txt` (must equal Table H's block byte for byte, 19 rows)
- [ ] the SHA-256 literal in the verification gate
- [ ] the three `--passphrase` expected lines and the `meanlen` line in the gate
- [ ] the eleven `--uuid-forms` expected lines in the gate
- [ ] the eleven `--perf` bait labels **in order**, the `262144` byte-count assertion, the strict numeric-field check, and the 400 ms budget in the gate

## Implementation notes & constraints

- **Do not touch `src/core/secret-scan.js`.** Not a comment, not a threshold, not
  a rule. If a corpus row does not behave as Table L says, that is a spec bug:
  say so in the PR and stop.
- **Do not touch `tests/unit/secret-scan.test.js`.** The new tests go in a new
  file, `tests/unit/secret-scan-baseline.test.js`.
- No new npm dependencies. The two fixtures are pure data and must not `require`
  anything from `src/`; the oracle in particular must be standalone, because its
  whole purpose is to survive the successor WP's edit to the detector.
- The corpus fixture must not `require` the oracle either. The **test file**
  requires both and joins them.
- `scripts/measure-entropy-arms.js` may read `process.argv` and may call
  `crypto.randomBytes` in `--perf` only.
- When uncertain, choose the simpler option and record it under "Decisions made".
  Do NOT add extra corpus rows, extra modes, or configurability.

## Security checklist

- [ ] Every credential-shaped literal in the corpus is **fake** — synthesized for
      this fixture, never a real key, never copied from a private vault,
      transcript or log.
- [ ] No verbatim sentence from the maintainer's notes or transcripts appears in
      any deliverable. The `NEGATIVE` rows are sanitized reproductions of the
      *shapes* that broke, not the text that broke.
- [ ] The frozen oracle is standalone: it contains no `require(` call, so a
      later edit to `src/core/secret-scan.js` cannot change what "today's rule
      did" means.
- [ ] **That independence is checked, not assumed** (Table O). The oracle is a
      copy of a *named* blob (O1, four recorded digests) and agrees with the
      shipped detector's own `high-entropy` behaviour on all **399** corpus and
      generator inputs, with an **empty** exemption set (O2–O4). An oracle that
      is wrong produces a self-consistent map, fixture, digest and gate; this
      differential is the only thing in the WP that would notice.
- [ ] The oracle resets `lastIndex` before each scan.
- [ ] No untrusted identifier flows into a filesystem path or a shell command —
      these files touch neither.
- [ ] The harness writes nothing to the filesystem and makes no network call.
- [ ] Merging this WP changes no shipped behaviour and therefore neither closes
      nor opens any defect. Nothing here may be cited as making any byte safer.

## Acceptance criteria

Every criterion is an assertion in `tests/unit/secret-scan-baseline.test.js`
against `scanAndRedact` or against the frozen oracle. Nothing observes a
non-exported internal.

- [ ] `tests/fixtures/secret-scan-legacy-entropy.js` is byte-identical to the
      block under "Exact contracts".
- [ ] All 18 `LABELLED_INPUTS` `deepStrictEqual` their `LABELLED_BASELINE` entry
      under `scanAndRedact`, comparing text, labels, severities and counts.
- [ ] Each of the 18 produces the label named in Table L row L-1.
- [ ] `LEGACY[id] === legacyEntropyFires(input)` for **every** id in `POSITIVE`,
      `SOFTENED`, `BOUNDARY`, `PRECEDENCE` and `RESIDUAL_FP`, and for `neg-1` …
      `neg-20`. This is the whole point of the WP: the map is asserted, not
      trusted.
- [ ] **Table O's differential (O2/O4): for every one of the 399 inputs —
      `NEGATIVE`, `POSITIVE`, `SOFTENED`, `BOUNDARY`, `PRECEDENCE`,
      `RESIDUAL_FP`, and all four generators —
      `legacyEntropyFires(input) === scanAndRedact(input).findings.some(f => f.label === 'high-entropy')`.
      The exemption of O3 applies to **0** of them, and the test asserts that the
      exemption set is empty: no input in the corpus produces a finding whose
      label is not `high-entropy`.** This is the assertion that would catch a
      mistranscribed oracle; without it the oracle, the map, the fixture and the
      digest are only consistent with each other.
- [ ] The four source-blob values in "Current state" match the working tree
      (O1): commit, `git hash-object`, file SHA-256, and the SHA-256 of lines
      155–186.
- [ ] Family sizes are exactly 18 / 20 / 23 / 9 / 31 / 13 / 3, and
      `delimiterClosure()`, `delimiterReverse()`, `delimiterInside()`,
      `shortSegments()` return exactly 95 / 5 / 100 / 100 entries.
- [ ] `LEGACY` has no key that is not an id of one of the five keyed families,
      and no id of those families is missing from it.
- [ ] Every id is unique across all families.
- [ ] The `old`-side counts hold: 8 of 20 `NEGATIVE`, 23 of 23 `POSITIVE`, 9 of 9
      `SOFTENED`, 15 of 31 `BOUNDARY`, 5 of 16 `PRECEDENCE`+`RESIDUAL_FP`, 95 of
      95 `delimiterClosure()`, 3 of 5 `delimiterReverse()`, 94 of 100
      `delimiterInside()`, 84 of 100 `shortSegments()` fire under the oracle.
- [ ] The six `delimiterInside` ids listed in L-9 are exactly the ones that do
      not fire, and the sixteen `shortSegments` ids described in L-10 are exactly
      the ones that do not fire there.
- [ ] Re-entrancy baseline: for every one of the 23 labels the module can emit,
      `scanAndRedact('[REDACTED:<label>]')` yields zero findings **today**.
- [ ] `scanAndRedact` behaviour on the oversized and non-string paths is
      unchanged and covered.
- [ ] `scripts/measure-entropy-arms.js` runs clean in all four modes; its
      `--baseline` output is byte-identical to
      `tests/fixtures/measure-entropy-arms.baseline.txt`; its `--passphrase` and
      `--uuid-forms` output matches Table H's blocks exactly; `--perf` prints
      exactly eleven strictly-parseable rows with the Table H labels in order,
      `262144` in field 2, and a finite non-negative field 3 under **400 ms**.

## Verification steps (run these; paste output in the PR)

This is an **executable gate**, not an observation. It exits non-zero on the
first failure. Note the two footguns it works around: `grep -c` prints a count
but exits 1 when the count is 0, and `node --test` exits non-zero when a test
fails — so TAP is captured to a file first and every count is compared
numerically.

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
TAP=$(mktemp)

need() { # need <actual> <expected> <what>
  [ "$1" -eq "$2" ] || { echo "GATE FAIL: $3 — got $1, expected $2"; exit 1; }
  echo "ok: $3 = $1"
}
expect_line() { grep -qxF "$(printf '%b' "$1")" "$2" \
  || { echo "GATE FAIL: missing expected line: $1"; cat "$2"; exit 1; }; }

# --- 0. the detector really was not touched --------------------------------
need "$(git diff --name-only main... | grep -cE '^src/' || true)" 0 \
     "files changed under src/"
need "$(git diff --name-only main... | grep -cxF 'tests/unit/secret-scan.test.js' || true)" 0 \
     "the pre-existing detector test is untouched"

# --- 1. the frozen oracle is a faithful copy of the live source ------------
SS=src/core/secret-scan.js
ORACLE=tests/fixtures/secret-scan-legacy-entropy.js
need "$(grep -cF '[A-Za-z0-9+/=]{' "$SS" || true)" 1 \
     "the live source has exactly one legacy candidate class"
need "$(grep -cF '/[A-Za-z0-9+/=]{24,}/g' "$ORACLE" || true)" 1 \
     "oracle reproduces the candidate class"
need "$(grep -cF '>= 3.5' "$ORACLE" || true)" 1 "oracle reproduces the 3.5 floor"
need "$(grep -cF 'lastIndex = 0' "$ORACLE" || true)" 1 "oracle resets lastIndex"
need "$(grep -cF 'require(' "$ORACLE" || true)" 0 "oracle requires nothing"
need "$(grep -cF 'require(' tests/fixtures/secret-scan-corpus.js || true)" 0 \
     "corpus requires nothing"

# Table O1: the oracle is a copy of a NAMED version of the detector. All four
# values are transcribed from this spec; if the detector moved, this fails and
# the oracle must be re-taken (and the spec's Current-state table updated).
[ "$(git hash-object "$SS")" = 'eb273e19050037542c8beb441b8a320a3248b514' ] \
  || { echo "GATE FAIL: src/core/secret-scan.js is not the blob the oracle copies"; exit 1; }
[ "$(shasum -a 256 "$SS" | cut -d' ' -f1)" \
  = 'be54813a2602a78822e939663ab31c3eff16426148c81a9394c0afc821584167' ] \
  || { echo "GATE FAIL: detector file digest changed"; exit 1; }
[ "$(sed -n '155,186p' "$SS" | shasum -a 256 | cut -d' ' -f1)" \
  = '624aea5f9ec59d0a6f115c8378380dae25fe475bbb49c5cc5340bbc6d242e9c8' ] \
  || { echo "GATE FAIL: the entropy-pass region the oracle copies changed"; exit 1; }
echo "ok: the oracle's recorded source blob matches the working tree (Table O1)"

# --- 2. the corpus ran, family by family -----------------------------------
node --test --test-reporter=tap tests/unit/secret-scan-baseline.test.js >"$TAP" 2>&1 || true
need "$(grep -cE '^ok [0-9]+ - baseline labelled: '   "$TAP" || true)"  18 "LABELLED cases"
need "$(grep -cE '^ok [0-9]+ - baseline negative: '   "$TAP" || true)"  20 "NEGATIVE cases"
need "$(grep -cE '^ok [0-9]+ - baseline positive: '   "$TAP" || true)"  23 "POSITIVE cases"
need "$(grep -cE '^ok [0-9]+ - baseline softening: '  "$TAP" || true)"   9 "SOFTENED cases"
need "$(grep -cE '^ok [0-9]+ - baseline boundary: '   "$TAP" || true)"  31 "BOUNDARY cases"
need "$(grep -cE '^ok [0-9]+ - baseline precedence: ' "$TAP" || true)"  13 "PRECEDENCE cases"
need "$(grep -cE '^ok [0-9]+ - baseline residual: '   "$TAP" || true)"   3 "RESIDUAL_FP cases"
need "$(grep -cE '^ok [0-9]+ - baseline closure: '    "$TAP" || true)"  95 "delimiterClosure cases"
need "$(grep -cE '^ok [0-9]+ - baseline reverse: '    "$TAP" || true)"   5 "delimiterReverse cases"
need "$(grep -cE '^ok [0-9]+ - baseline inside: '     "$TAP" || true)" 100 "delimiterInside cases"
need "$(grep -cE '^ok [0-9]+ - baseline short: '      "$TAP" || true)" 100 "shortSegments cases"
need "$(grep -cE '^ok [0-9]+ - baseline reentrancy: ' "$TAP" || true)"  23 "re-entrancy cases"
# Table O2/O4: the oracle is compared against the SHIPPED detector, 399 inputs,
# 0 disagreements, 0 exemptions. This is the only assertion in this WP that
# checks the oracle against something other than itself.
need "$(grep -cE '^ok [0-9]+ - baseline differential: ' "$TAP" || true)" 399 "oracle vs shipped differential cases"
need "$(grep -cE '^ok [0-9]+ - baseline differential exemptions are empty$' "$TAP" || true)" 1 \
     "the O3 exemption set is empty"
need "$(grep -cE '^not ok ' "$TAP" || true)" 0 "failing tests in the baseline file"

# --- 3. the harness reproduces its frozen table EXACTLY --------------------
BASE=tests/fixtures/measure-entropy-arms.baseline.txt
need "$(shasum -a 256 "$BASE" | cut -d' ' -f1 \
        | grep -cFx '2e86bfae3262282d7e6fc2ac076763760f2a1e90895ca5230e4925b3c65addae' || true)" 1 \
     "baseline fixture matches the digest recorded in this spec"
need "$(awk 'NR>2' "$BASE" | wc -l | tr -d ' ')" 19 "baseline fixture has 19 generator rows"
node scripts/measure-entropy-arms.js --baseline >"$TAP"
diff -u "$BASE" "$TAP" \
  || { echo "GATE FAIL: --baseline output differs from the checked-in fixture"; exit 1; }
echo "ok: --baseline table is byte-identical"
# the default mode must BE --baseline
node scripts/measure-entropy-arms.js >"$TAP"
diff -u "$BASE" "$TAP" || { echo "GATE FAIL: default mode is not --baseline"; exit 1; }
echo "ok: default mode == --baseline"

node scripts/measure-entropy-arms.js --passphrase >"$TAP"
expect_line 'bare\tentropy-old\t99.31\tgate-old\t99.31' "$TAP"
expect_line 'prose\tentropy-old\t99.31\tgate-old\t99.31' "$TAP"
expect_line 'assignment\tentropy-old\t100.00\tgate-old\t100.00' "$TAP"
expect_line 'meanlen\t28.0' "$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 4 "--passphrase prints exactly four lines"
echo "ok: passphrase baseline exact"

# --uuid-forms: ALL ELEVEN lines, byte for byte. A missing or misreported row
# must fail, so the line count is asserted too.
node scripts/measure-entropy-arms.js --uuid-forms >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 11 "--uuid-forms prints exactly eleven lines"
expect_line 'authorization-colon\tno'  "$TAP"
expect_line 'bearer-header\tyes'       "$TAP"
expect_line 'token-colon\tyes'         "$TAP"
expect_line 'token-equals\tyes'        "$TAP"
expect_line 'api_key-colon\tyes'       "$TAP"
expect_line 'secret-equals\tyes'       "$TAP"
expect_line 'password-colon\tyes'      "$TAP"
expect_line 'client_secret-json\tyes'  "$TAP"
expect_line 'x-api-key-colon\tyes'     "$TAP"
expect_line 'session-prose\tno'        "$TAP"
expect_line 'bare\tno'                 "$TAP"
echo "ok: all eleven uuid forms exact"

# --perf: parsed STRICTLY. `$3+0 > BUDGET` alone accepts NaN, empty and negative
# values (all coerce to 0) and would pass a harness that printed garbage.
node scripts/measure-entropy-arms.js --perf >"$TAP"
need "$(wc -l <"$TAP" | tr -d ' ')" 11 "--perf prints exactly eleven baits"
PERF_LABELS='one-long-run random-base64 ab-dash-bait camel-bait delimiter-padding hex-run segment-dense-word segment-dense-blob uuid-dense segment-dense-nonword segment-dense-short'
awk -F'\t' -v want="$PERF_LABELS" -v budget=400 -v cap=262144 '
  BEGIN { n = split(want, L, " ") }
  {
    if (NF != 3) { printf "GATE FAIL: line %d has %d fields, expected 3\n", NR, NF; bad = 1; next }
    if ($1 != L[NR]) { printf "GATE FAIL: line %d label %s, expected %s\n", NR, $1, L[NR]; bad = 1 }
    if ($2 != cap) { printf "GATE FAIL: %s bytes %s, expected %d\n", $1, $2, cap; bad = 1 }
    if ($3 !~ /^[0-9]+(\.[0-9]+)?$/) { printf "GATE FAIL: %s ms %s is not a finite non-negative number\n", $1, $3; bad = 1; next }
    if ($3 + 0 > budget) { printf "GATE FAIL: %s took %s ms, budget %d\n", $1, $3, budget; bad = 1 }
  }
  END { if (NR != n) { printf "GATE FAIL: %d rows, expected %d\n", NR, n; bad = 1 } exit bad }' "$TAP"
echo "ok: eleven perf baits, labels in order, bytes == SCAN_MAX_BYTES, each under 400 ms"

# --- 4. the permission boundary held ---------------------------------------
need "$(git diff --name-only main... | grep -cvE '^(tests/fixtures/secret-scan-(corpus|legacy-entropy)\.js|tests/fixtures/measure-entropy-arms\.baseline\.txt|scripts/measure-entropy-arms\.js|tests/unit/secret-scan-baseline\.test\.js|docs/specs/WP-secret-scan-baseline-oracle\.md|package-lock\.json)$' || true)" 0 \
     "files outside the permission boundary"

# --- 5. full suite and lint ------------------------------------------------
npm test
npm run lint
echo "ALL GATES PASSED"
```

**What this gate does not do, stated plainly.** It is a script an implementer
runs locally and pastes into the PR body. Adding it to `.github/workflows/ci.yml`
is deliberately not in this WP's Deliverables, so a branch on which it was never
run can be merged and nothing will object. This WP claims **no** CI enforcement;
do not describe it as gated, enforced, required or blocking.

## Out of scope (do NOT do these)

- Any change to `src/core/secret-scan.js`, including comments, thresholds and
  `ScanLimits`. Fixing the entropy pass is `WP-secret-fence-shape-and-context`.
- Any change to `tests/unit/secret-scan.test.js` or to any consumer test.
- Any change to the EP2 / EP4 gates or their `findings.length > 0` condition.
- Any change to `docs/adr/0024-layered-secret-lifecycle.md`. The ADR amendment
  belongs to the successor WP, which is where the behaviour actually changes.
- Adding a `new`/candidate column to the corpus, or a `--candidate` mode to the
  harness. Those are the successor WP's deliverables and they must not be
  pre-committed here.
- Adding the gate to `.github/workflows/ci.yml`.
- Restoring the three notes quarantined on 2026-07-24 — maintainer recovery,
  tracked separately.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `test(secret-scan): freeze the pre-change detector baseline (WP-secret-scan-baseline-oracle)`.
3. PR template filled, including "Decisions made" and `Generated-by:`. The PR
   body must state that this WP changes no shipped behaviour.
4. This spec's `status:` flipped to `In-Review` in the same PR.
