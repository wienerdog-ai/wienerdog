---
title: WP-dream-report-run-skips re-pinned to a47f2546 after two siblings landed in dream.js
date: 2026-09-17
related_wps: [WP-dream-report-run-skips, WP-dream-lock-stale-owner-loud, WP-dream-digest-omits-own-job-alerts]
---

# WP-dream-report-run-skips re-pinned to `a47f2546`

`WP-dream-report-run-skips` closed its design gate `Ready` with one precondition
outstanding: its `src/cli/dream.js` citations were pinned to `2d5e2465`, and two
sibling packages were queued to edit that file first. Both have landed — PR #253
(`WP-dream-lock-stale-owner-loud`, about +25 lines before the outer `try`) and
PR #257 (`WP-dream-digest-omits-own-job-alerts`, about +85 lines) — so this is
that one re-pin. **Documentation only; `status` stays `Ready`.**

## Method, and why it is not an offset

Every citation was re-located by **finding its construct** with `grep`, then
checking **both ends** of the range against the code. An offset would have been
wrong anyway — the two PRs insert at three different depths (the require block,
the lock-acquisition block before the collector, and the last statement of the
locked body) — but the rule holds regardless: a citation names a construct, and
the only honest way to move it is to find that construct again.

The `path:line` pairs were extracted **mechanically** from the spec by a script
rather than by reading, and rewritten by a second script that refuses to touch a
reference it has no explicit mapping for (it exits non-zero on any unmapped hit;
it reported zero). A bare `` `:NNN` `` was rewritten only when the reference
belongs to `dream.js` — this mattered: `promote.js` is cited at `:708`, `:737`
and `:751` for its heading emissions, and `dream.js`'s new `collectExtracts` line
is also `:708`. A global replace would have silently corrupted three citations
into a file that never changed.

## What moved, and what did not

`git diff --stat 2d5e2465 a47f2546` over the files this spec cites: **only
`src/cli/dream.js` changed.** `src/core/dream/promote.js`, `scratch.js`,
`ledger.js`, `warnings.js`, `src/core/transcripts/index.js`, `stream.js` and
`skills/wienerdog-dream/SKILL.md` are byte-identical, so every citation into them
is untouched and was left alone.

**29 citations rewritten, 0 unmapped.** The 15 distinct ranges:

| Construct | before | after | both ends re-checked |
|---|---|---|---|
| `const sel = collectExtracts(...)` | `:622-624` | `:708-710` | `const sel = collectExtracts(` … `});` |
| memo folded into the ledger | `:627-630` | `:713-716` | `const memoChanged = …` … `}` |
| `exclusions[]` built + printed | `:683-700` | `:780-797` | `const exclusions = [];` … `for (const message of exclusions) …` |
| per-quarantine console loop | `:705-712` | `:802-809` | `for (const q of sel.newlyQuarantined) {` … `}` |
| record quarantines + refresh 1 | `:721-732` | `:818-829` | `if (sel.newlyQuarantined.length > 0 && !dryRun) {` … `}` |
| refresh point 1 | `:729` | `:826` | `reportWarningsRefresh(refreshWarnings({ vaultDir, ledger }));` |
| no-admission throw | `:736-743` | `:833-840` | `if (sel.entries.length === 0 && exclusions.length > 0) {` … `}` |
| idle return | `:746-757` | `:843-854` | `if (sel.entries.length === 0) {` … `}` |
| refresh point 3 | `:755` | `:852` | `if (!dryRun) reportWarningsRefresh(…);` |
| dry-run return | `:765-768` | `:862-865` | `if (dryRun) {` … `}` |
| `promote({...})` call | `:956-967` | `:1053-1064` | `res = promote({` … `});` |
| the `promote` catch | `:968-981` | `:1065-1078` | `} catch (err) {` … `}` |
| undelivered record dump | `:1119-1131` | `:1216-1228` | `const undelivered =` … `}` |
| `sel.processed` ledger loop | `:1150-1163` | `:1247-1260` | `for (const d of sel.processed) {` … `}` |
| refresh point 2 | `:1187` | `:1284` | `reportWarningsRefresh(refreshWarnings({ vaultDir, ledger }));` |

Two measured claims elsewhere in the spec were re-run rather than assumed, because
both name a SHA: `grep -c "first time"` over `warnings.js`, `ledger.js`,
`dream.js` and `doctor.js` still returns 0 for each, and the three code-owned
headings still appear only at `promote.js:585/588/591` (declaration) and
`:708/:737/:751` (emission).

## The interaction check — is #257's new final render a problem?

**No, and the reason is positional rather than a guard.** `regenerateDigest({
omitOwnJobAlerts: true })` is the last statement of the locked body
(`src/cli/dream.js:1320`), placed **after** the workspace-teardown `finally` and
therefore after `promote()` (`:1053`) and after the run's one commit. It writes
`<state>/digest.md` and nothing else (`:755-756`), touches no vault path, and
closes over `ledger` — never over `sel` or over `promote()`'s result. **It cannot
change the report this package writes**, and this package adds nothing that could
change it: the section is composed inside `composeRecord`, which the new statement
does not reach.

The other half of the question is whether the counts still exist where the section
is composed. They do: `sel` is declared at `:708` and is still in scope at the
`promote()` call at `:1053` — same function body, nested block — so every count
Table B names is available at the call site, and the one new field the collector
must return (`sel.skippedQuarantined`) is unaffected by either PR.

**Test helpers: nothing to make true.** `tests/unit/dream-pipeline.test.js` grew by
about 538 lines across the two PRs, gaining a `runDream` `onLog` hook and a changed
`ENV_KEYS` allowlist. That file is **not** a Deliverable of this package, and the
spec never mentions `runDream`, `dream-pipeline`, `ENV_KEYS` or `onLog` — checked
by grep — so there is no instruction in it that the new helper shape could
falsify. The three test files this package does list are unchanged in contract:
`dream-collect.test.js` and `dream-promote.test.js` were not touched by either PR,
and `tests/integration/dream.test.js` gained overdue-lock cases that share no
fixture with this package's.

## Verdict

**A mechanical re-pin with no contract change.** No construct disappeared, no
behaviour moved, no count became unreachable, and nothing outside the citation
numbers, the pinned-base sentences and the now-discharged precondition was edited.
The spec's own gate, worked-example fences and RED-proof `find` sets were re-run in
both directions afterwards and still agree. `status` stays `Ready` on exactly that
basis; had any of it been more than line numbers, the spec would have gone back to
`Draft` instead.
