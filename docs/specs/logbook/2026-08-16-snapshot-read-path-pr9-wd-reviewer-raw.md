# PR gate — wd-reviewer spec-fidelity review, PR #9

WP: WP-snapshot-read-path-hardening
Gate: wd-reviewer (the merge gate)
PR: felho/wienerdog#9, branch `wp/snapshot-read-path-hardening` @ `6e8e145`,
base `main` @ `79ba77f`
Read-only check: `git status --porcelain` empty before and after, byte-identical
(the reviewer ran and reported both).

Raw output, byte-unchanged inside the fence, committed **before the findings
were acted on** per `docs/runbooks/codex-review.md` ("Rules"). Transport
artifacts decoded and nothing else touched: the notification channel delivered
`&lt;` and `&gt;` where the reviewer had written `<` and `>`.

Verdict: **REQUEST-CHANGES**, two findings, both test-coverage defects rather
than code defects; the reviewer states explicitly that the implementation is
contract-faithful and that no spec bug is involved.

`````text
## REQUEST-CHANGES

**Read-only proof.** `git status --porcelain` at start: empty (exit 0). At end: empty (exit 0). Byte-identical. HEAD unchanged at `6e8e145`. No file in the repo was written, edited or deleted; the only writes were to `/tmp`.

**Commands I actually ran (not read):**

| Command | Exit | Result |
|---|---|---|
| `node scripts/boundary-check.js docs/specs/WP-snapshot-read-path-hardening.md $(git diff --name-only origin/main...HEAD)` | 0 | every changed file allowed |
| `npm test` | 0 | 2014 tests, 2005 pass, 0 fail, 9 skipped |
| `npm test -- --test-name-pattern "vault-snapshot"` | 0 | 132 tests, 132 pass, **0 skipped** (POSIX + unprivileged, so no case silently sat out) |
| `npm run lint` | 0 | markdownlint 0 errors, frontmatter 218 specs / 4 agents; shellcheck + pwsh absent locally, CI has them |
| `node -e` probes (buffer view/copy discrimination, `-file cap` substring, `readFileSync` absence, `O_NOFOLLOW`/`O_NONBLOCK` presence) | 0 | see findings 1 and the notes below |

The implementation is contract-faithful. Both findings are test-coverage defects, not code defects, and neither is a spec bug — no routing to wd-architect is warranted.

---

### Findings

**1. [criteria] `/Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/vault-snapshot.test.js:711-714` — the dormant tenth literal's vocabulary assertion cannot fail. MUST FIX.**

The spec's acceptance criterion requires "The dormant file-count literal is asserted as vocabulary only" (spec `:385`), backing Table C's ten-literal reason set (`:248`). The test asserts:

```js
assert.ok(
  source.includes('-file cap'),
  'the literal is still in the module: the vocabulary is preserved'
);
```

`exceeds the ${MAX_FILE_BYTES}-byte per-file cap` (src `:281`) contains the substring `-file cap` (inside `per-file cap`). I verified this by removing the `MAX_FILES` literal from an in-memory copy of the module and re-testing the predicate: it still returns `true`. So the one literal in the vocabulary that has no runtime outcome behind it also has no working guard — delete `exceeds the ${MAX_FILES}-file cap` from `src/core/vault-snapshot.js:285` entirely and the whole suite stays green, which is exactly "a test that would pass on a wrong implementation."

Fix: assert on a substring unique to that literal, e.g. `source.includes('${MAX_FILES}-file cap')` (the template text as it appears in source), and keep the message. Severity: medium — one line, but it is the only assertion standing behind that criterion.

**2. [criteria] `tests/unit/vault-snapshot.test.js:415-728` — `O_NONBLOCK` (Table B row 3) has no coverage at all. SHOULD FIX.**

Table B (spec `:219`) gives `O_NONBLOCK` its own row with a named consumer: it "turns 'a FIFO swapped in after the `lstat` hangs the routine forever' into an ordinary visible skip, via the `fstat` type check." The Mirrored Surface Checklist (spec `:259`) registers "Table B's three flag rows" as owed acceptance criteria, and criterion 3 (spec `:369-372`) closes with "In no case does the run hang or throw."

The suite covers row 5 with the directory case only (`:524-549`). Criterion 3 says "a directory, **or** a FIFO on POSIX", so the letter is met — but the consequence is that `O_NONBLOCK` is untested: strike it from `OPEN_FLAGS` (`src/core/vault-snapshot.js:61`) and all 132 vault-snapshot tests still pass while a POSIX FIFO in a source slice hangs the routine indefinitely. The `O_NOFOLLOW` row is covered (`:504-522`) and `O_RDONLY` is covered implicitly by the write path; this row is the only one with nothing behind it.

Fix: add a POSIX-gated case that creates a FIFO in `reports/dreams/` (`child_process.execFileSync('mkfifo', [p])`) and asserts the skip reason is `not a regular file (symlinks are never followed)` with `reads.length === 0`, `opens === 1`, `closes === 1`. **Give the test an explicit `timeout`** (`{ skip: !POSIX, timeout: 5000 }`) — without `O_NONBLOCK` the open blocks forever, and node:test has no default timeout, so a regression must fail rather than wedge CI. Severity: medium.

---

### Everything else checks out — specifics

**Boundary (clean).** Eleven changed files: the spec (always allowed), eight under `docs/specs/logbook/` (always allowed per `scripts/boundary-check.js:54`, never a Deliverables entry by repo rule — confirmed by reading the script), and `src/core/vault-snapshot.js` + `tests/unit/vault-snapshot.test.js`, both listed. `tests/unit/broker-wiring.test.js` is listed but untouched, which is what its row predicted; it passes unedited inside the full run. Nothing stray.

**Contract fidelity (Tables A, B, C) — each item you named, verified in the code:**

- *Pre-open `lstat` decides only the non-regular refusal, no cap.* `src/core/vault-snapshot.js:222-232`. Renamed `st` → `ls`; `.size` is never read anywhere in the module (grepped).
- *Exactly one open per candidate, Table B flags, no `|| 0`.* `:58-61` composes `O_RDONLY | O_NOFOLLOW | O_NONBLOCK` through `typeof … === 'number' ? … : 0` — an explicit presence branch, with the fallback comment at `:50-56` naming both what is absent and what is lost. Table B leaves platform-vs-capability keying to the implementer "recorded under Decisions made"; the PR body records it. Open at `:238`, and `log.opens === 1` for a single candidate is asserted at test `:546`.
- *`fstat` as the authoritative type check.* `:254`. Table C row 5's new refusal is asserted at test `:539-548`, including `reads.length === 0` — the exact path a narrower `finally` would leak.
- *Read bounded at `MAX_FILE_BYTES + 1`, buffer allocated AT the bound, handed onward as a copy.* `readBounded` at `:76-85`: `Buffer.alloc(MAX_FILE_BYTES + 1)`, loop `while (filled < buf.length)` requesting `buf.length - filled`, `return Buffer.from(buf.subarray(0, filled))`. Boundary arithmetic is right — a MAX-byte file yields `filled === MAX` (not over cap); a MAX+1-or-larger file yields exactly `MAX + 1` (over cap). No `readFileSync` remains in the module (verified programmatically). Test `:584-601` asserts (a) `requested <= MAX+1` and (c) `bufferLength === MAX+1` per read, and (b) accumulated `<= MAX+1`. Test `:603-618` asserts the copy-not-view half; I confirmed empirically that it discriminates — a view's `buf.buffer.byteLength` is 262145 (fails), a copy's is 65536 (passes).
- *Descriptor scope opens immediately after the open, closes before caps/gates/write.* `:251-270`. The `try` starts before the `fstat`, the `finally` closes with a swallowed inner `catch` (`:265-269`), and every skip decided inside leaves through it via the `reason` sentinel at `:271-274`. Close-pairing asserted at `:622-633` (`closes === opens`, `leaked === 0`) and `:635-648` (write-side throw, descriptor already gone).
- *All three caps on the bytes read, today's order and strings.* `:280-291` — per-file → file count → total, all on `buf.length`, all reason strings byte-unchanged.
- *Byte total charged the bytes read.* `:303` `totalBytes += buf.length` (was `st.size`).
- *Table C ladder and its named crossover.* Rows 1-10 map one-to-one onto `:225`, `:229`, `:239`, `:259`, `:254`, `:259`, `:280`, `:284`, `:288`, `:294`. Both halves of the owner-ruled crossover are asserted: over-cap + unopenable → `unreadable` (test `:553-566`) and over-cap + failed read → `unreadable` (test `:568-580`). Both would report the cap reason under the old code, so both genuinely discriminate.

**Acceptance criteria.** All fourteen are satisfied and each has a test behind it, with these notes: criterion 3's FIFO alternative is unexercised (finding 2); criterion 7's dormant-literal half is vacuously asserted (finding 1); and criterion 9's closing clause "such a source is skipped with the per-file cap reason **and nothing is copied**" — test `:584-601` asserts the reason but omits the `!copied(...)` half. The equivalent shape is covered at `:501`, so this is a note, not a finding. The three headline regression tests are all discriminating against the pre-change code: the grow case (`:491-502`, was `appears to contain a secret`), the symlink swap (`:504-522`, was a silent out-of-vault copy), the directory swap (`:524-549`, was `unreadable`). The mode-000 case at `:310-321` survives unedited and still reports `unreadable`, now from the open.

**Preserved-unchanged.** Cap values, `SNAPSHOT_PLANS` and its `dir`/`newest`/`provenanceGated`, the filename-descending pick, the gate chain and order, the write of the ORIGINAL bytes at `:301`, the budget rule, the visible-skip contract, 0700/0600, the mirrored layout, the empty-plan path, the everything-gated-out shape — all asserted at tests `:346-388`, `:390-413`, and the module `exports` line is byte-identical to `origin/main` (`readBounded` and `OPEN_FLAGS` stay module-private). Signature and return shape unchanged.

**The five registered mirrors — all in agreement.** (1) JSDoc `:162-180`: the symlink claim is now explicitly file-level ("The symlink posture is FILE-LEVEL… A symlinked SOURCE DIRECTORY … is FOLLOWED by design"), names the 2026-08-15 ruling and its grounds, and keeps "consumes NEITHER budget" and the no-fallback paragraph intact. Yes to both parts of your question. (2) Read-site comment: the "Read ONCE, AFTER the caps" claim is gone; the inverted ordering is now stated at the cap site (`:276-279`) and the single-read invariant at `:292-293`. (3) Write-site comment `:301` preserved verbatim. (4) Module-header exceed paragraph `:9-15` untouched and still true. (5) Test comment `:407-410` rewritten — it keeps the derived clause and explicitly inverts the abolished one, citing Table A as canonical rather than restating it.

**CLAUDE.md conventions.** No new dependencies (`node:fs`/`node:path` only), plain Node ≥ 18, JSDoc types throughout the new `readBounded`/`OPEN_FLAGS` blocks, no TypeScript, no build step, ADR-0004 intact (nothing starts anything; the descriptor is the only resource and it is closed synchronously before the write). All 19 commits are conventional with the `(WP-snapshot-read-path-hardening)` suffix, and each is one logical change — spec authoring, per-round logbook, per-round spec fix, then a single implementation commit `b01a6c0`, then the status flip. PR title matches the Definition of Done byte-for-byte; PR body carries the four Decisions made (including the required flag-branch decision), Generated-by, and verification output whose numbers match what I re-ran. Spec `status: In-Review` ✓.

**Nothing extra, nothing missing.** The only additions beyond the spec's ask are the test-side `instrumented` helper and `underReport` hook (`:431-487`), which are what make Table A's read-primitive and descriptor-lifecycle contracts observable at all — the spec explicitly leaves test design to the implementer. The helper restores `fs` in a `finally` and scopes its fd counting to vault paths, so it does not inflate its own assertions. One cosmetic nit, not a finding: `src/core/vault-snapshot.js:171` wraps at ~97 columns where the rest of that JSDoc block wraps at ~78.

**Closed-contract drift check (ADR-0031).** No settled contract is silently reinterpreted. The frozen reason vocabulary, the cap values, `SNAPSHOT_PLANS` and the Done gate chain all come through untouched. The one assignment that changes — Table C row 3's crossover — is an owner ruling recorded in the canonical table, echoed in Table A's open-failure row by citation rather than restatement, and asserted in tests. No mirror is promoted to primary: the JSDoc, the read/write/header comments and the test comment all defer to Table A, and the test comment names it by ID. The three-level chain (logbook ruling → Table A's accepted-directory row → JSDoc prose) moves in the correct direction. I found no Deliverables cell, acceptance criterion or prose step out of agreement with Tables A, B or C, and no contract-dense inline prose that still wants extracting — Table C's extraction did its job, and the two findings above are test-side, not contract-family recurrences.
`````
