---
title: Round zero for WP-secret-sink-wiring-probes — nine call sites measured, and the chunk leak is whole, not partial
date: 2026-09-17
related_wps: [WP-secret-sink-wiring-probes, WP-124-durable-output-sanitizing, WP-122-shared-secret-detector]
---

# Round zero for WP-secret-sink-wiring-probes

`WP-secret-sink-wiring-probes` was drafted against a tree that has since moved.
PR #245 rewrote `src/cli/dream.js`, `src/core/dream/*` and
`src/core/transcripts/*`; PR #253 added a lock gate to `dream.js`'s teardown;
PR #252 changed `src/scheduler/descriptor.js`. Every executable claim in the draft
was re-derived against `242c37b8` and every sink was **measured** with a throwaway
node probe driving the sink's real public entry point and reading the artifact
back off disk. Nothing was fixed; the WP stays diagnostic.

Base: `242c37b8cbffc9f9b67528332474333ff05f4740`. Node `v25.9.0`, darwin.

## 1. The probe string, re-verified against the shipped detector

The draft's constants survive unchanged. `src/core/secret-scan.js:88` is
`simpleRule(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'anthropic-key', SEVERITY.QUARANTINE)`.
Measured with `scanAndRedact`:

| Input | `.text` | `.findings` |
|---|---|---|
| `sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff` (48 ch) | `[REDACTED:anthropic-key]` | `[{anthropic-key, quarantine, 1}]` |
| `sk-ant-api03-PROBE-aaaa-` (`PROBE_HEAD`, 24 ch, 17 after `sk-ant-`) | unchanged | `[]` |
| `bbbb-cccc-dddd-eeee-ffff` (`PROBE_TAIL`, 24 ch) | unchanged | `[]` |
| `'F'.repeat(1976) + PROBE`, sliced to 2000 | unchanged | `[]` |

So both halves and the truncated prefix trip no rule, under the shipped
detector, exactly as the draft claimed. **The draft's inline comment calling the
rule `severity redact` is wrong — it is `QUARANTINE`.** Harmless for
`redactOnly` (which returns `.text` regardless) and corrected in the spec.

The draft also claimed the halves were re-verified against "the detector proposed
in `WP-secret-fence-shape-and-context`". That spec is `status: Superseded`, in
`docs/specs/done/`, and was **never implemented**
(`docs/specs/done/WP-secret-allowlist-exact-value-store.md:72-78`). There is no
second detector. All four references were rewritten to say so.

## 2. The inventory is nine call sites in five sinks, not eight

`grep -rn redactOnly src bin scripts skills` over `242c37b8`, minus the detector's
own file:

| Sink | `redactOnly` call sites (measured line numbers) | Artifact on disk | Draft said |
|---|---|---|---|
| alerts | `src/core/alerts.js:48` (`sanitizeAlert`'s `scrub`; `MAX_FIELD_CHARS = 2000` at `:29`) | `state/alerts.jsonl` | `:47`, `:28` |
| run evidence | `src/core/run-evidence.js:64` (`sanitizeArgv`), `:78` (`sanitizeRecord`'s `scrub`) | `state/run-evidence.jsonl` | same — unchanged |
| transcript extracts | `src/core/transcripts/index.js:67` (inside `redact`, which `capMessage` calls at `:103`) | `state/dream-scratch/<harness>-<session_id>.json`, written at `src/core/dream/scratch.js:129` | `:67` "inside `capMessage`"; write at `scratch.js:215` |
| brain logs | `src/core/dream/brain.js:517` (stderr), `:545` (stdout) | `logs/dream/<YYYY-MM-DD>.log` | `:287`, `:315` |
| routine logs | `src/cli/run-job.js:1055` (stdout), `:1060` (stderr), **`:1120` (failure message)** | `logs/<job>/<YYYY-MM-DD>.log` | `:867`, `:872` — **`:1120` was missing entirely** |

`run-job.js:1120` is a durable-log `redactOnly` call site the draft did not know
about: `logStream.write(redactOnly('\nwienerdog: job failed to run: ' + …))` in
the `finally` block, for a non-`WienerdogError` failure. It is a whole-string
redaction with no cap and no chunking, and it measures SAFE — but a completeness
claim over "every call site" was false without it, which is the whole point of a
diagnostic WP. The spec now carries sixteen probes, not fifteen.

Other `redactOnly` callers, inventoried and **excluded with a reason**, so the
list is closed rather than merely short:

- `src/core/dream/promote.js:621` and `src/cli/dream.js:320` — `neutralise()`,
  `WP-dream-promote-report` Table N's redact-then-sanitise transformation.
  `promote.js` is not ungated: the composed record is refused fail-loud at
  `promote.js:770` (`if (redactOnly(text) !== text) throw`), which puts it in the
  EP2/EP4 gate class, not the sink class. `dream.js:320` feeds `console.log`
  (`:1145`, `:1148`, `:1214`); on the scheduled path that stdout is teed into the
  routine log by the sink already inventoried above, and on the interactive path
  it is not a durable artifact at all.
- `src/core/digest.js:146` — a comment, not a call.

The two gates moved too: EP2 is `src/core/dream/validate.js:1402`
(`if (findings.length === 0) return { ok: true };`), not `:934`; EP4 is
`src/core/digest.js:713`, `:738-739`, `:780`, not `:506,521,543`.

## 3. Measured behaviour, sink by sink

Each row drove the sink's real public entry point and read the artifact back off
disk. `safe` is the spec's invariant: `artifact.includes(MARKER) &&
!artifact.includes(PROBE_HEAD)`.

| Probe | Feed | `safe` | MARKER | `PROBE_HEAD` in file | whole `PROBE` in file |
|---|---|---|---|---|---|
| alerts `reason`, `appendAlert` | WHOLE | **true** | yes | no | no |
| alerts `reason`, `appendAlert` | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| run-evidence argv, `recordRunEvidence` | WHOLE | **true** | yes | no | no |
| run-evidence argv | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| run-evidence `job`, `recordRunEvidence` | WHOLE | **true** | yes | no | no |
| run-evidence `job` | STRADDLE-TRUNCATE | **false** | no | **yes** | no |
| transcripts, `collectExtracts` | WHOLE | **true** | yes | no | no |
| brain stdout, `spawnBrain` | WHOLE | **true** | yes | no | no |
| brain stderr, `spawnBrain` | WHOLE | **true** | yes | no | no |
| brain stdout | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| brain stderr | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine stdout, `runjob.run` | WHOLE | **true** | yes | no | no |
| routine stderr, `runjob.run` | WHOLE | **true** | yes | no | no |
| routine stdout | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine stderr | STRADDLE-CHUNK | **false** | no | **yes** | **yes** |
| routine failure message, `runjob.run` | WHOLE | **true** | yes | no | no |

Literal artifacts, for the record:

- alerts, truncate feed — the line ends
  `…FFFFFFFFsk-ant-api03-PROBE-aaaa-","log_hint":"h"}`.
- brain log, stdout chunk-straddle — the file is exactly
  `sk-ant-api03-PROBE-aaaa-bbbb-cccc-dddd-eeee-ffff\n`.
- routine log, failure-message site — the file is
  `\nwienerdog: job failed to run: spawn /…/no-such-[REDACTED:anthropic-key] ENOENT\n`.

## 4. The chunk leak is WHOLE, and the code says otherwise

`src/core/dream/brain.js:504-508` documents the chunk-boundary case as a
**known limitation, OWNER-APPROVED 2026-07-17**, in these words: *"a secret split
across a chunk boundary may be only partially redacted"*. `src/cli/run-job.js:1048-1052`
carries the same claim by reference (*"a boundary-split secret may be partially
redacted (accepted residual, see brain.js)"*).

**Measured, nothing is partially redacted.** When the two halves land in separate
chunks, neither half matches any rule, so neither call redacts anything, and the
two writes land contiguously: the complete 48-character credential is present
byte-for-byte in `logs/dream/<date>.log` and in `logs/<job>/<date>.log`. The
approved residual is real; the sentence describing it understates it, and the
understatement is what would let a reader conclude the artifact holds a fragment.

This is recorded, not fixed. It is routed in the spec under "Discovered issues /
routed" and is not this WP's work. The four log files are mode 0600 under
`logs/<job>/` created 0700 (`createLogStreamPrivate` / `mkdirPrivate`), so the
exposure is same-user, which is the boundary the threat model already draws — but
"same-user durable plaintext credential" is a materially different fact from
"partial fragment", and the two sentences above should be corrected by whichever
WP takes the fix.

## 5. The chunk-straddle fixture is timing-dependent, and a control proves it

A **control** was run: the same two writes with no delay between them.

| Fixture | Result |
|---|---|
| `printf HEAD; sleep 0.3; printf TAIL` | log is the raw whole credential — the defect reproduces |
| `printf HEAD; printf TAIL` (no delay) | log is `[REDACTED:anthropic-key]` — **safe** |

The shell flushes both writes before the parent's reader runs, the parent reads
one chunk, and `redactOnly` sees the whole credential. So a chunk-straddle probe
written without a forced boundary is not a weaker probe — it is the *opposite*
probe, and it would go red against a sink that is behaving exactly as measured.
The spec now states the requirement (the fixture must force a real chunk
boundary) and records the residual (a parent stalled longer than the delay
coalesces the reads and reddens the probe spuriously — a loud red, never a silent
green).

That same control is what makes the four chunk-defect probes *relevant* without a
declared ADR-0042 mutation: whole-in-one-chunk and split-across-two differ only in
the boundary, at the same handler, with the same bytes.

## 6. Test-harness facts the spec depends on

- `tests/unit/dream-collect.test.js`: `tempPaths()` at **:19**, `emptyLedger()` at
  **:31**, `writeClaude(...)` at **:37** (draft said 18 / 30 / 36).
- `collectExtracts` is now `(paths, ledger, maxInputBytes, {preprocessTimeoutMs,
  now} = {})` — a fourth options parameter arrived with PR #245
  (`src/core/dream/scratch.js:46-49`). The three-argument call the probe needs is
  still valid.
- `cleanScratch` is `src/core/dream/scratch.js:163-164`; `src/cli/dream.js` calls
  it at **:1240**, and since PR #253 only **inside `if (ownsLock(paths.state))`**
  (`dream.js:1239-1241`). The draft cited `dream.js:595` and
  `scratch.js:245` and described the teardown as unconditional.
- `tests/unit/dream-brain.test.js` already drives `spawnBrain` with a real
  `logStream` and a pinned fake brain (`pinFakeBrain` at :157, the EP3 test at
  :345). `tests/unit/scheduler-runjob.test.js` drives the log tee through
  `withRun(... fakeResolve(script) ...)` (helpers at :33, :92, :102, :125; the EP3
  test at :796). Both harnesses were reused verbatim for the measurements above,
  so the spec's "drivable from the existing test file" claim is measured, not
  assumed.

## 7. What changed in the spec as a result

- Inventory: eight call sites → **nine**; fifteen probes → **sixteen** (P16, the
  `run-job.js:1120` failure-message site).
- Every `file:line` cite re-derived; eleven were wrong.
- The dead `WP-secret-fence-shape-and-context` references withdrawn.
- Defect probes gained a **positive-presence** assertion. `assert.equal(safe,
  false)` alone passes against an *empty* artifact, which is exactly the vacuity
  class ADR-0042 exists for; the truncate probes now also assert `PROBE_HEAD` is
  present and the chunk probes that the whole `PROBE` is present.
- RED evidence: the spec now requires it per ADR-0042, states the two mutation
  families that produce it by single exact-substring replacement, and names the
  four probes that are exempt because per-chunk redaction cannot be made
  whole-stream by one substring.
- The transcript sink's transience is restated against the lock gate.

## 8. Template-conformance round zero, and a literal declaration file that was validated, not asserted

The clean-context conformance read returned FAIL with three light items, all
fixed in a second commit on the same branch:

1. `## Contract reference` had dropped the template's parenthetical. Restored to
   `## Contract reference (optional — mark N/A if this WP is not contract-dense)`.
2. `## Security checklist` likewise → `## Security checklist (delete only if the
   WP touches no untrusted input)`.
3. The template requires *"For file-generating code, show a literal expected
   output file in full."* The Deliverables table CREATES two
   `tests/red-proofs/*.proofs.json` files and "Exact contracts" described only
   their mutation semantics. The smaller one
   (`secret-sink-wiring-probes-alerts.proofs.json`, Table R row R1) is now
   published byte-for-byte.

**The literal was validated by loading it, not by re-reading the schema.**
`scripts/red-proofs.js` exports `loadDeclarations(root)` (`:2217` export list,
definition at `:469`), which is the runner's own LOAD phase and calls
`validateProof` (`:633`) on every entry. Run against a temp root holding only
`tests/red-proofs/`:

```
loadDeclarations OK — 3 proofs: alerts-redact-before-truncate,
  runev-argv-redact-before-truncate, runev-field-redact-before-truncate
  alerts-redact-before-truncate: find occurs 1x in src/core/alerts.js (declared 1)
  runev-argv-redact-before-truncate: find occurs 1x in src/core/run-evidence.js (declared 1)
  runev-field-redact-before-truncate: find occurs 1x in src/core/run-evidence.js (declared 1)
```

The second file (Table R rows R2 and R3) was drafted and loaded too, so the
spec's claim that it "has the same shape" is measured rather than promised; only
R1 is published in the spec, per the conformance instruction.

The loader was also shown to **refuse** four deliberately broken variants, so
the green above is a check and not a no-op:

| Break | Loader |
|---|---|
| `id` not a kebab slug (`Alerts_Bad`) | refused |
| `file` equal to the suite it reddens | refused |
| `replace` not containing `marker` | refused |
| `expectRed` empty | refused |

**Relevance, measured separately.** Loading proves the declaration is
well-formed, not that the mutation matters. Applying R1's `replace` to a copy of
`src/core/alerts.js` and driving `appendAlert` with the `STRADDLE-TRUNCATE` feed
gave `safe=true marker=true head=false` — i.e. under the mutation P2's
`assert.equal(safe, false, …)` fails, which is exactly the red the declaration
claims. Without this step the proof could have been well-formed and inert.

**One real defect was found in the spec's own verification block while doing
this.** The AC9 check was written as `node -e '…'` and its new expected-value
table contains `''` (from `String(v == null ? '' : v)`), which closes the bash
single quote and breaks the script. It is now `node - <<'JS' … JS`, a quoted
heredoc, which has no such interaction. Re-measured in all three states after
the change: compliant → exit 0; R1's `find` and test name mutated → two named
GATE FAILs, exit 1; R1 deleted → a clean `R1 absent` message, exit 1 (an earlier
draft threw an uncaught `ENOENT` there, which is a red for the wrong reason).

## 9. Design review round 1 — APPROVE, gate closed at round 1

| | |
|---|---|
| Verdict | **APPROVE** — no substantive product/security finding, and no machinery finding beyond the residuals the spec already discloses |
| Backend | Codex plugin 1.0.6, model `gpt-6-astra` |
| Tip reviewed | `2d3e6ce1cddd53b6a8bc3ce3eeacf95d386f075c` |
| Base | `242c37b8cbffc9f9b67528332474333ff05f4740` |
| Raw preserved before adjudication | `ddc8e653`, as `…-design-r1-astra-raw.json` with its `-focus.txt` and `-meta.txt` |

**What it EXECUTED** (not read): the real scanner; the alert and evidence
writers; `spawnBrain`; `runJob`; transcript collection — with filesystem and
process dependencies intercepted. It confirmed the three 24-character truncation
leaks, the four contiguous whole-credential chunk leaks and the safe controls. It
**reproduced both brain-stream leaks through actual subprocess pipes with two
observed chunks**. It confirmed all three order-swap mutations discriminate, that
the literal R1 declaration loads through `loadDeclarations`, that the
positive-presence assertions reject an empty artifact, that **coalesced chunks
make the defect assertion FAIL rather than pass vacuously**, and that the fixture
helpers use temporary roots.

**What it only READ**: the citations, which it reports resolve.

**Independent inventory check**: it looked for a tenth in-scope `redactOnly`
site and **found none** — the nine of Table S, plus the two the table names and
excludes, is the whole set on this tree.

**Two caveats, both folded into the spec rather than left in this entry:**

1. *A failing SAFE assertion can print the synthetic probe value into CI
   diagnostics.* No real credential is involved — the `SAFE` form passes
   `artifact` as its message by design, so a red probe publishes whatever the
   fixture was fed. This is now a Security-checklist item and an Implementation
   note: fixtures take **only** the repo's own synthetic patterns, never an
   environment variable, a developer-supplied file, or anything read from the
   machine.
2. *Filesystem permissions in the review sandbox prevented independent on-disk
   reproduction and full gate execution; captured write payloads are not
   disk-durability verification.* The reviewer names the remedy as
   implementation's step, and Definition of done item 1 now **requires** it: all
   sixteen probes run against real temporary files under their own `mkdtemp`
   root, plus the unfiltered `npm run red-proofs`, `npm test` and `npm run lint`
   pasted into the PR body.

**Closure.** Per `docs/runbooks/codex-review.md` ("Weighted closure"), the loop is
done when a round finds nothing about the product. Round 1 found nothing about
the product, both caveats are machinery-side and were fixed **within the existing
surface** — no new gate, no new probe — so the gate is **CLOSED at round 1** and
the spec moves to `Ready`. Base pinned for dispatch: `main` at `35e00e99`, on
which all fifty citations were re-confirmed resolving after the rebase.

## 10. Re-pin to `a47f2546` after PR #257 — a mechanical re-pin, no contract change

Dispatch-time re-verification against `main` at `a47f2546` found **stale cites**,
which blocks dispatch and routes the spec back to the architect
(`docs/runbooks/codex-review.md`). PR #257 merged `WP-dream-digest-omits-own-job-alerts`:
roughly +85 lines into `src/cli/dream.js`, and 99 lines appended at the END of
`tests/unit/scheduler-runjob.test.js` (`@@ -3024,3 +3024,102 @@`).

**Six citations moved, all in `src/cli/dream.js`, all re-derived by grepping for
the construct rather than by adding an offset:**

| Cite | Was | Now | Construct grepped for |
|---|---|---|---|
| `neutralise`'s `redactOnly` call | `:320` | **`:321`** | `sanitizeProjectName(redactOnly(String(value)));` (`:320` is now the `function neutralise(value) {` header) |
| first console consumer | `:1145` | **`:1222`** | `neutralise(res.report.reason)` |
| second console consumer | `:1148` | **`:1225`** | `neutralise(res.report.accounting.reason)` |
| out-of-vault consumer | `:1214` | **`:1291`** | `console.log(... neutralise(r.path) ...)` |
| lock-gated teardown block | `:1239-1241` | **`:1327-1329`** | `if (ownsLock(paths.state)) {` … `releaseLock(paths.state);` — **both ends checked** |
| `cleanScratch` call | `:1240` | **`:1328`** | `cleanScratch(paths.state);` |

**Nothing but line numbers moved.** Every cited construct still exists, byte-identical:
the `neutralise` body, the three console consumers, and the teardown block
(comment text and all three statements unchanged). The nine-site inventory was
re-derived from scratch with `grep -rn redactOnly src bin scripts skills` and is
**unchanged** — the same nine sink call sites and the same two excluded callers,
no tenth. The eight redaction-site cites outside `dream.js` all still resolve and
none of those files changed. **No construct disappeared and no behaviour changed,
so this is a mechanical re-pin: no contract in the spec is affected and no new
design round is owed.** The gate stays CLOSED at round 1; status stays `Ready`.

`tests/unit/scheduler-runjob.test.js` now ends with that package's three
`OWNJOB-AC6*` tests (file is 3125 lines; last test starts at `:3105`). The
helpers this WP's probes reuse are near the top and were **confirmed unaffected**
by an append at the end: `setup()` `:33`, `writeScript()` `:92`, `withRun()`
`:102`, `fakeResolve` `:125`, the EP3 reference test `:796` — all unchanged. An
Implementation note now records that this WP's five probes append after the
`OWNJOB-AC6*` block.

**Mechanical re-check of every citation in the spec**, after the fix. The
extractor pulls each `path:N`, `path:N-M`, `path lines A-B` and bare `` `:N` ``
continuation out of the spec, attributes each bare form to the most recently
named file, and prints the line it resolves to on `a47f2546`:

```text
docs/specs/done/WP-secret-allowlist-exact-value-store.md:72-78   [path:N]
  72: 1. **`WP-secret-fence-shape-and-context` is superseded and was never
   ...
  78: spec, do not implement it, do not depend on it.
package.json:24   [path:N]
  24: "red-proofs": "node tests/with-temp-root.js scripts/red-proofs.js",
src/cli/dream.js:1222   [bare :N]
  1222: ? `wienerdog: dream — the report could not be written to your vault (${neutralise(res.report.reason)
src/cli/dream.js:1225   [bare :N]
  1225: `(${neutralise(res.report.accounting.reason)}); the complete record of this run follows.`
src/cli/dream.js:1291   [bare :N]
  1291: for (const r of records) console.log(`wienerdog: dream — out-of-vault: ${neutralise(r.path)} — ${r.r
src/cli/dream.js:1327-1329   [path:N]
  1327: if (ownsLock(paths.state)) {
   ...
  1329: releaseLock(paths.state);
src/cli/dream.js:1328   [path:N]
  1328: cleanScratch(paths.state);
src/cli/dream.js:321   [path:N]
  321: return sanitizeProjectName(redactOnly(String(value)));
src/cli/run-job.js:1048-1052   [path:N]
  1048: // EP3 (audit A5 / ADR-0024 / WP-124): redact each chunk before it reaches
   ...
  1052: // never closes the stream (the old pipe's { end:false } semantics).
src/cli/run-job.js:1055   [path:N]
  1055: logStream.write(redactOnly(chunk.toString('utf8')));
src/cli/run-job.js:1060   [path:N]
  1060: logStream.write(redactOnly(chunk.toString('utf8')));
src/cli/run-job.js:1120   [path:N]
  1120: logStream.write(redactOnly(`\nwienerdog: job failed to run: ${failure && failure.message}\n`));
src/core/alerts.js:48   [path:N]
  48: const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, MAX_FIELD_CHARS));
src/core/digest.js:146   [path:N]
  146: * slices and only THEN runs `redactOnly`, which expands. The price is accepted —
src/core/digest.js:713   [path:N]
  713: if (secretScan.scanAndRedact(section).findings.length > 0) {
src/core/digest.js:738-739   [bare :N]
  738: secretScan.scanAndRedact(rawSection).findings.length > 0 ||
   ...
  739: secretScan.scanAndRedact(projectsSection).findings.length > 0
src/core/digest.js:780   [bare :N]
  780: if (secretScan.scanAndRedact(normalized.join('\n')).findings.length > 0) {
src/core/dream/brain.js:504-508   [path:N]
  504: // Known limitation (OWNER-APPROVED 2026-07-17): a secret split across a
   ...
  508: // scan, WP-126 0600 log modes, no log content in email) cover the residual.
src/core/dream/brain.js:517   [path:N]
  517: const redacted = redactOnly(chunk.toString('utf8'));
src/core/dream/brain.js:545   [path:N]
  545: const redacted = redactOnly(chunk.toString('utf8'));
src/core/dream/promote.js:621   [path:N]
  621: return sanitizeProjectName(redactOnly(String(value)));
src/core/dream/scratch.js:129   [path:N]
  129: writeFilePrivate(scratchFile, JSON.stringify(extract, null, 2)); // 0600, no trailing newline
src/core/dream/scratch.js:163-164   [path:N]
  163: function cleanScratch(stateDir) {
   ...
  164: fs.rmSync(scratchDirOf(stateDir), { recursive: true, force: true });
src/core/dream/scratch.js:46-49   [path:N]
  46: function collectExtracts(paths, ledger, maxInputBytes, {
   ...
  49: } = {}) {
src/core/dream/validate.js:1402   [path:N]
  1402: if (findings.length === 0) return { ok: true };
src/core/run-evidence.js:64   [path:N]
  64: out.push(redactOnly(a.slice(0, 2000)));
src/core/run-evidence.js:78   [path:N]
  78: const scrub = (v) => redactOnly(String(v == null ? '' : v).slice(0, 2000));
src/core/secret-scan.js:314-316   [path:N]
  314: function redactOnly(text) {
   ...
  316: }
src/core/secret-scan.js:88   [path:N]
  88: simpleRule(/sk-ant-[A-Za-z0-9\-_]{20,}/g, 'anthropic-key', SEVERITY.QUARANTINE),
src/core/transcripts/index.js:102-110   [path:N]
  102: function capMessage(message) {
   ...
  110: }
src/core/transcripts/index.js:103   [bare :N]
  103: const redacted = redact(message.text);
src/core/transcripts/index.js:67   [path:N]
  67: return redactOnly(text);
tests/unit/dream-brain.test.js:157   [path:N]
  157: function pinFakeBrain(root, core, fakeScriptPath, name = 'claude') {
tests/unit/dream-brain.test.js:345   [bare :N]
  345: test('dream-brain: a secret in brain output is redacted in the teed log AND stderrTail (WP-124 EP3)'
tests/unit/dream-collect.test.js:19   [bare :N]
  19: function tempPaths() {
tests/unit/dream-collect.test.js:31   [bare :N]
  31: function emptyLedger() {
tests/unit/dream-collect.test.js:37   [bare :N]
  37: function writeClaude(paths, sessionId, msgCount, msgLen, when) {
tests/unit/scheduler-runjob.test.js:102   [bare :N]
  102: async function withRun(env, envOverrides, argv, opts) {
tests/unit/scheduler-runjob.test.js:125   [bare :N]
  125: const fakeResolve = (script) => () => ({ command: script, args: [], shell: false });
tests/unit/scheduler-runjob.test.js:3105   [bare :N]
  3105: test('scheduler-runjob: OWNJOB-AC6e — an ordinary dream failure is recorded after the child exits, s
tests/unit/scheduler-runjob.test.js:33   [bare :N]
  33: function setup(vaultRel = 'wienerdog') {
tests/unit/scheduler-runjob.test.js:796   [bare :N]
  796: test('scheduler-runjob: the run-job log tee redacts a secret in child output (WP-124 EP3)', async ()
tests/unit/scheduler-runjob.test.js:92   [bare :N]
  92: function writeScript(dir, name, lines) {

43 distinct citations; 0 unresolvable
```

Two short-form citations are written without a directory prefix and are outside
that extractor's path pattern, so they were checked by hand on the same tree:
`alerts.js:29` → `const MAX_FIELD_CHARS = 2000;` and `promote.js:770` →
`if (redactOnly(text) !== text) {`. Both resolve.
