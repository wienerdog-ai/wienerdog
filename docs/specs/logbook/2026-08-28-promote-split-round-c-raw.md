---
title: Pass (c) — the undirected confirming round (raw), the promote family
date: 2026-08-28
related_wps: [WP-dream-promote-module, WP-dream-promote-report, WP-dream-promote-in-workspace]
---

<!-- markdownlint-disable -->
<!-- Verbatim reviewer body — EVIDENCE, never reformatted. -->

# Pass (c) — the undirected confirming round (raw)

Reviewer: gptsol, external, FRESH agent, UNDIRECTED. Vendored
`docs/runbooks/review-prompts/adversarial.md`, unedited — **and the reviewer
verified the vendored body's sha256 against the file's own declared checksum
before using it**, which no prior round did. Targets: all three specs, whole
settled text at `6bc0ff4`.

**Committed BEFORE adjudication.** Condensation declared: the prior-findings
verdict table is carried by its verdicts (14 rows, 12 genuinely fixed, 1
re-worded-but-still-defective, and the two findings below); both findings are
verbatim and complete. The full table is in the agent transcript.

**Read-only, verified independently**: `git status --porcelain` empty before and
after.

## Verdict

`needs-attention`. **NO-SHIP.** "The report contract permits a sanitizer
ordering that can persist context-dependent secrets, and the module's base
return type still does not require the path-bearing published outcomes claimed
by the prior fix."

## Prior findings — 12 genuinely fixed

F1, F2, R3-1, R3-2, R3-3, R3-4, R2-1, I018, I078, I081, I085, I093, I095 all
ruled **genuinely fixed**, each with current lines cited. **R2-2 / R1-1 ruled
"re-worded but still defective"** — see Finding 2.

## Finding 1 — Sanitizing before EP2 can erase the context that makes a secret detectable

- **Materiality:** **A**
- **Affected file:** `docs/specs/WP-dream-promote-report.md`
- **line_start:** 191 **line_end:** 192 **Confidence:** 0.98

**What can go wrong**

A context-dependent secret in `r.path` or `r.reason` can be written into the durable dream report without redaction. The contract requires each value to pass through the shipped display sanitizer and EP2, but does not prescribe their order. An implementation that applies the display sanitizer first conforms to the stated "through BOTH" rule while potentially destroying the syntax EP2 uses to recognize a secret.

**Why vulnerable**

`sanitizeProjectName` replaces characters such as `=` and `:` with `_`. The EP2 scanner has rules whose detection depends on those separators. A direct probe against the cited shipped functions produced:

```text
raw:       refused token=abcdefghijkl
sanitized: refused token_abcdefghijkl
EP2 after sanitizer: no findings
EP2 on raw value:    refused token=[REDACTED:generic-secret]
```

The same problem occurs for `client_secret: abcdefghijkl`. Lines 191-192 then assert that the code-authored section cannot carry refusable bytes and therefore needs no gate. That assertion is false under one ordering explicitly permitted by the current text. The acceptance criterion at lines 295-305 asks that both transformations be present, but does not pin the order or require a separator-dependent detector case; an implementation can pass with a prefix-shaped test secret while leaking the contextual class.

**Likely impact**

A credential value can persist in the vault's report even though the spec claims that channel is secret-safe. This is a durable security leak that can conform to the written rule and a plausible test implementation.

**Concrete recommendation**

Require this exact direction for every interpolated `r.path` and `r.reason`, including caller-supplied records:

1. Run EP2 redaction on the raw value while its secret-bearing context is intact.
2. Apply `sanitizeProjectName` to the already-redacted output for markdown/display neutralisation.
3. Compose the report only from that result.

Add acceptance cases using secrets detectable only through context that the display sanitizer removes, including at least `token=abcdefghijkl` and `client_secret: abcdefghijkl`. Assert that the raw secret bytes are absent from both the normal second write and the fallback.

## Finding 2 — The prior `{rel, bytes}` return-contract defect remains on ordinary outcomes

- **Materiality:** **B**
- **Affected file:** `docs/specs/WP-dream-promote-module.md`
- **line_start:** 181 **line_end:** 228 **Confidence:** 0.97

**What can go wrong**

`promote()` can be implemented with `promoted` and `redacted` entries that carry `bytes` but no path, while still satisfying the only explicit shape in Table S. The pipeline would then be unable to associate decided bytes with the vault path to stage, count, or register.

**Why vulnerable**

The base `### Exact contracts` block declares parameters but has no `@returns` annotation. Table S says `promoted[].bytes` and `redacted[].bytes` are required; `refused[]` is explicitly `{rel, reason}`; published report arms are discriminated. **It never requires `promoted[]` or `redacted[]` to be `{rel, bytes}`.** The report package only extends the missing base shape with `...`, so it cannot repair it. This is the same field-level defect described by R1-1/R2-2: prose says decided bytes are available per path, but the published ordinary-outcome type does not enforce the path half.

The omission is operationally significant because G8 needs path-to-byte association for the commit and G10 needs it for skill registration. Table S itself says its shape, rather than prose, must guarantee the contract, so the current text fails its own stated standard.

**Likely impact**

The implementer must invent the base return type, or can produce a locally conforming shape that cannot satisfy the pipeline. Likely to fail during downstream implementation or PR review, but it can also lead to path-based re-reads being reintroduced as an expedient workaround.

**Concrete recommendation**

Add the full base return annotation to `promote()` and make the ordinary published shapes explicit: `promoted: Array<{rel, bytes}>`, `redacted: Array<{rel, bytes, ...required Table Q accounting metadata}>`, `refused: Array<{rel, reason}>`, and an exact type for `secretDisposition`. Then have the report package extend that concrete return type rather than an ellipsis. Mirror `{rel, bytes}` in Table S row S2 and in the published-outcome acceptance criterion.

## Scope objections

**None.** No objection to the package seams, consumed-by-nothing staging, package sizes, cross-package citation style, or named residuals.

## Execution report

**This round RAN its checks — the first of the loop to run the suite.**

| Command | Exit | Result |
|---|---:|---|
| `git rev-parse HEAD && git rev-parse main && git status --porcelain` | 0 | `HEAD=6bc0ff4…`, `main=36c2ce5…`, clean |
| vendored-prompt body sha256 vs its declared checksum | 0 | `f3b28a6c…aefe0f` — **matches** |
| `npm test` | 1 | one baseline failure: `adopt-e2e: init → adopt → sync → dream…`, an executable-pin mismatch (test `claude` resolved inside the temp home against the fnm-pinned path). Other tests passed |
| `npm test -- --test-name-pattern 'adopt-e2e: init'` | 1 | reproduced: 107 passed, 1 failed, same cause |
| `npm run lint` | 0 | markdownlint and frontmatter passed; shellcheck/PSScriptAnalyzer skipped (binaries absent) |
| node probe: `sanitizeProjectName` then `scanAndRedact` | 0 | **demonstrated Finding 1's bypass** on `token=…` and `client_secret: …` |
| node probe: `scanAndRedact` twice | 0 | scanner output stable on already-redacted prefix-shaped values |

**Self-corrected during the run, and disclosed:** an initial checksum attempt
using `tail -n +13` exited 0 but hashed the wrong byte range, producing
`28c9456…`; it was **not treated as verification**, and the marker-based command
above was used instead.

Read-only inspection covered all three target specs in full with line numbers,
the permitted `done/` context, the inventory record, and `validate.js`,
`cli/dream.js`, `reap.js`, `digest.js`, `secret-scan.js`, `ledger.js` plus
relevant tests. No file was created, edited, deleted, staged or committed.

## Author's verification, before adjudication

Both findings reproduced independently on the tree:

- **Finding 1:** `sanitizeProjectName('refused token=abcdefghijkl')` returns
  `refused token_abcdefghijkl` — the `=` the contextual detector needs is gone.
- **Finding 2:** `### Exact contracts` in the module half contains an `@param`
  block and **no `@returns` at all**.
