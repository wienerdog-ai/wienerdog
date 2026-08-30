---
title: Round zero raw — quarantine surface split (internal coherence pass, verbatim)
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round zero raw — internal coherence pass, relayed verbatim

Reviewer: a clean-context executor (Claude general-purpose agent) that took no
part in drafting. Tree: `wp/quarantine-surface-split` @ `77a41f9`. Committed
before adjudication per `docs/runbooks/codex-review.md`. The report below is
the executor's final message, unedited except HTML entity de-escaping.

---

Internal coherence pass complete. All work was read-only; the tree is untouched.

# Findings

1. **WP-doctor-quarantine-counts.md:90 — count mismatch "Nine are inline; three use the helper-loop idiom".** Four of the twelve groups use the helper-loop idiom (`src/cli/doctor.js:408` scheduler — quoted as the example — plus skill links `:414`/`:417`, stale hooks `:423`, Google readiness `:427`); eight are inline. LIGHT.
2. **WP-doctor-quarantine-counts.md:131 — stale citation `:44`.** `execFileSync(process.execPath, …)` is at `tests/unit/doctor.test.js:45`; `:44` is a comment line. LIGHT.
3. **WP-doctor-quarantine-counts.md:109 — stale citation `:344`.** `const vaultPath = readVaultPath(paths.config);` is at `src/cli/doctor.js:345` (`:344` is the group comment; the group-order use of `:344` at line 103 is fine). LIGHT.
4. **WP-quarantine-warnings-file.md:136 — "Step 3 (`:1222`)".** Step 3's header is `src/core/dream/validate.js:1211`, first statement `:1223`; `:1222` is the tail line of its preamble comment. LIGHT.
5. **WP-quarantine-warnings-file.md:138 and :334 — Step-5 ranges off at both citations.** `:1410-1429` begins on the blank line `1410` (header is `:1411`); Table D's `:1426-1428` **excludes `else notes++;` at `:1429`** — the very line Table D is about, and the spec's own quoted snippet is lines 1427-1429. LIGHT.
6. **WP-quarantine-banner-decay.md:100 — `recordSecretDeferred` `:292`.** The `updated_at` write it points at is `src/core/dream/ledger.js:293` (`:292` is `deferrals: n,`); the sibling citations `:256`/`:269`/`:308` are exact. LIGHT.
7. **WP-quarantine-warnings-file.md:89-90 — quote misattributed to the cited range.** "the ONLY sanctioned way for this family to write a vault CONTENT file" is at `src/core/dream/vault-write.js:169` (the `writeIntoVault` JSDoc), not in the module header `:6-11`, which carries a different sentence. LIGHT.
8. **WP-quarantine-warnings-file.md Table E (:339-353) — the Two→Three writers fix creates an unnamed stale twin.** `src/core/dream/vault-write.js:7` says "The family owns exactly two such writers"; the file is not a deliverable and no doc (spec, ADR Amendment 2, logbook :84-88) names this residual, so after the WP the module header contradicts the GLOSSARY. Implementer should be told to file it under Discovered issues. LIGHT.
9. **WP-doctor-quarantine-counts.md:38 — "73% of the digest budget".** ADR Amendment 2 (:251-252) and WP-banner (:38-39) say 16,805 bytes = 73% of a 22,986-byte **digest**; against the 32 KB **budget** it is 51%. LIGHT.
10. **WP-quarantine-warnings-file.md:416-417 — duplicated phrase.** "…the same one the digest banner, the dream console lines and dream console lines use…". LIGHT.
11. **WP-quarantine-warnings-file.md:470 — vacuous-today verification step.** `npm test -- --test-name-pattern "warnings"` exits 0 with zero matching tests (node --test reports the 108 test *files* as passing entries even when the name pattern matches nothing — verified with a nonsense pattern: `tests 108, pass 108, exit 0`), so this step cannot go red on the deliverable-absent state. The absent case is covered only by the node gates. LIGHT.
12. **WP-quarantine-banner-decay.md:144-145 — "Amendment 2 is already on `main`" is false on today's tree.** `main` = `dcd5777` carries no Amendment 2; it exists only in this branch's commit `77a41f9`. True post-merge, but the sentence is present-tense and fails today's range check. LIGHT.
13. **WP-quarantine-warnings-file.md:249 — activation (vi) names the wrong inheritor.** It credits `WP-quarantine-banner-decay` with inheriting the path contract, while the spec's own Table A path row (:265), Current state of WP-doctor (:125-128) and the logbook (:115-117) all say the constant's importer is `WP-doctor-quarantine-counts` (the banner carries the path only inside its fixed sentence). LIGHT.
14. **WP-doctor-quarantine-counts.md:245/:249 — "the next dream run writes it" over-promises against the warnings spec's own refresh contract.** Per WP-warnings Table B + dream.js: refresh point 1 fires only on `newlyQuarantined > 0`, point 2 only on a run that gets past the `:467-470` return. A fully idle run (nothing fresh, no new quarantine) reaches **neither** — exactly the upgrade scenario of an install with only pre-existing quarantines and no file yet, where doctor's warn branch keeps promising a write the next idle dream run does not perform; the file arrives only on the next non-idle run (Table C row 3 reconciliation at point 2). Either the warn wording or the rationale row ("the condition really is resolved by the next dream run") needs a hedge. HEAVY (it is a shipped, byte-gated message text).
15. **ADR-0023 Amendment 2 restated invariant (:340-347) vs banner Table B.** "the digest carries an exact count for a bounded window **after the quarantine set changes**" — the mechanism (Amendment §3 and WP-banner Table B, consistently) is per-record `updated_at` freshness: a shrink-only set change re-renders the count but starts no window and cannot re-raise a stale banner. Paraphrase drift inside the ADR itself. LIGHT.
16. **WP-doctor-quarantine-counts.md:348 — retype gate has an evasion hole.** The regex catches only `'reports/warnings.md'` / `"reports/warnings.md"`; a backtick template-literal retype passes the gate. LIGHT (gate hardening).

Deliberate non-findings confirmed: the three surfaces' different reason→label strings (by design, each internally consistent, each covering the 4 quarantine-bearing reasons + unrecognized; the typedef's fifth value `secret-revert` rides only `deferred` records); "Which ones" (banner) vs "which sessions" (doctor/report) pointer phrasing; the 7-day window (7 days / `604800000` / "7 over 14") identical everywhere; the dependency fan (frontmatter `depends_on` = logbook table = ADR closing paragraph = each spec's prose, including banner's explicit non-dependence on doctor); no doc still names `wienerdog doctor` as a banner target; the dream-report pointer sentence claims doctor gives counts, not the list — correct.

# Per-citation results

**src/core/dream/ledger.js** — `:21` ✓, `:41-43` ✓ (exact fn), `:58-66` ✓ (typedef incl. closing `*/`; 5 reason values as claimed), `:82` ✓, `:125` (migrateFromWatermarks, implied) ✓, `:256` ✓, `:269` ✓, **`:292` OFF → 293** (finding 6), `:308` ✓, `:319` ✓, `:328` ✓, `:346` ✓, `:365-371` ✓ (the exact `lines.push(…)` of the actionable sentence; quoted intake snippet byte-matches `:352-358`), `:382-393` ✓ (exact fn). `updated_at` read by nothing today ✓.
**src/core/dream/vault-write.js** — `:205` ✓; **`:6-11` quote misattributed** (finding 7); zero production call sites ✓.
**src/cli/dream.js** — 646 lines ✓; `:373-376` ✓, `:375` ✓, `:377` ✓, `:388-407` ✓ (exact closure), `:391` ✓, `:396` ✓, `:410-415` ✓, `:416-422` ✓, `:427` ✓, `:443-447` ✓ (exact block), `:444` ✓, `:451-470` ✓, `:467-470` ✓, `:474-477` ✓, `:507` ✓, `:572-580` ✓ (exact call, 7 keys as listed), `:597-611` ✓, `:604` ✓, `:625` ✓.
**src/core/dream/validate.js** — `:1074` ✓, `:1144` ✓, `:1208` ✓, **`:1222` OFF → 1211/1223** (finding 4), `:1374-1409` ✓ (exact Step 4, both ends), **`:1410-1429` OFF-start → 1411** and **`:1426-1428` OFF-end → 1427-1429** (finding 5); `:1428` (logbook) ✓.
**src/cli/doctor.js** — 438 lines ✓; `:60-61` ✓ (read-only/never-fail statement), `:67` ✓, `:185` ✓, `:237` ✓, `:311` ✓, `:312` ✓, `:315-319` ✓ (exact closure incl. JSDoc), `:321` ✓, `:325` ✓, `:337` ✓, `:344` ✓ (group), **`:344` for the `const vaultPath` statement OFF → 345** (finding 3), `:354` ✓, `:366` ✓, `:367-368` ✓, `:393` ✓, `:401` ✓, `:406` ✓, `:407-408` ✓, `:410` ✓, `:420` ✓, `:425-427` ✓, `:429-433` ✓, `:432` ✓, `:435` ✓.
**src/core/digest.js** — `:24-31` ✓ (exact `DigestCaps`, both ends), `:633-639` ✓ (exact opts typedef), `:833-838` ✓ (join at 833-836, capping return at 838; position 3 in a 7-element prefix ✓). `capDigest` reserves prefix lines/bytes ✓.
**src/cli/sync.js:288** ✓. **src/core/layout.js:39** ✓. **src/core/dream/scratch.js:81-102** ✓ (exact JSDoc; return shapes match spec claims). **src/core/vault-snapshot.js:109,112** ✓ (`'reports/dreams'` literals, newest-1/7). **skills/wienerdog-dream/SKILL.md:409-425** ✓ (exact "## Dream report" section). **docs/GLOSSARY.md:73-75** ✓ (sentence spans exactly those three lines).
**Tests** — ledger.test.js `:183` ✓, `:406` ✓, `:421` ✓, `:441` ✓, `:453` ✓; dream-validate.test.js `:270` ✓; dream.test.js `:757` ✓, `:789` ✓ (name byte-matches), `:860` ✓; sync-digest-quarantine.test.js `:86`/`:113`/`:134` ✓; digest.test.js `:184`/`:192`/`:1101` ✓ (all three carry the old banner literal); doctor.test.js: 37 `test(` call sites, all named `doctor …` ✓, `tempEnv` `:14` ✓, **execFileSync `:44` OFF → 45** (finding 2). `grep -rl quarantine tests/golden` → nothing ✓; `tests/golden/digest-default.md` exists ✓.
**Absent-input assertions** — all check out: `selectState` (:173), `secretDeferralCount` (:221), `migrateFromWatermarks` (:125), `SECRET_REVERT_EXHAUSTED_REASON`, `readVaultPath`, `precommitSessionEdits`, `docs/runbooks/spec-authoring.md`, `docs/specs/done/WP-quarantine-review-cli.md`, `docs/specs/done/WP-dream-vault-write-primitive.md`, the three promote WPs all `status: Ready`, WP-dream-promote-report's `records?: Array<{path,reason}>` input and "retiring today's report handling" note, ADR-0031's exactly-7 condition list with (i)-(vii) meanings matching every activation cited, ADR-0023 baseline's "may additionally surface it (a deferred follow-up)" at `:158`.

**PROVISIONAL bucket (WP-dream-report-run-skips)** — every PROVISIONAL citation is TRUE on today's tree (77a41f9, whose src/ equals dcd5777): validate.js:1374-1409, dream.js:572-580/:377/:373-375/:416-422/:427/:444/:410-415/:604/:467-470, scratch.js:81-102, ledger.js:382-393, SKILL.md:409-425, and the `validateAndCommit` call-site key list — all exact, both ends where ranged.

# Per-step verification results

| Spec | Step | Exit | Reading |
|---|---|---|---|
| warnings | `npm test -- --test-name-pattern "warnings"` | 0 (0 matching tests) | **FINDING** (vacuous today — finding 11) |
| warnings | `--test-name-pattern "^ledger: "` | 0 | GREEN |
| warnings | `--test-name-pattern "dream-validate"` | 0 | GREEN |
| warnings | `--test-name-pattern "dream-integration"` | 0 | GREEN |
| warnings | `npm test` | 0 | GREEN |
| warnings | `npm run lint` | 0 | GREEN |
| warnings | Table A template gate | 1 (ENOENT warnings.js) | RED-EXPECTED |
| warnings | Table A+C wiring gate | 1 (MODULE_NOT_FOUND) | RED-EXPECTED |
| warnings | Table E GLOSSARY gate | 1 ("GOT 0 \| superseded sentence still present") | RED-EXPECTED |
| warnings | SKILL.md negated grep (`warnings.md`) | 0 | GREEN (negative invariant; discriminates) |
| doctor | `--test-name-pattern "^doctor"` | 0 | GREEN |
| doctor | `npm test` / `npm run lint` | 0 / 0 | GREEN |
| doctor | messages gate | 1 (all 8 needles missing) | RED-EXPECTED |
| doctor | discipline gate | 0 | GREEN (negative invariant; absent-deliverable case is carried by the messages gate; backtick evasion — finding 16) |
| banner | `"^ledger: "` / `"sync-digest-quarantine"` / `"dream-integration"` / `npm test` / lint | 0 | GREEN |
| banner | banner-text gate | 1 (2 MISSING + withdrawn wording present) | RED-EXPECTED |
| banner | window gate | 1 (no exported 604800000) | RED-EXPECTED |
| banner | golden gate (`git diff --name-only main -- tests/golden/`) | 0 | GREEN — `main` resolves to dcd5777 = origin/main = the spec's pinned baseline; no golden differs; discriminates |
| dream-report | `"^ledger: "` / `"dream-validate"` / `"dream-integration"` / `npm test` / lint | 0 | GREEN |
| dream-report | skip-section gate | 1 (TypeError: runSkipSummarySection is not a function) | RED-EXPECTED |
| dream-report | SKILL.md negated grep (`could not consolidate`) | 0 | GREEN (negative invariant; discriminates) |

Count checks not already covered: worked-example arithmetic all exact (52428800 B = 50.0 MB, 51404120 B = 49.0 MB, 3+191/0 run-log deltas consistent with the Current-conditions blocks; doctor's 191+1 example matches Table A rows and row order; banner's N=1 sentence is ~245 B < 400); "the last four/two/three/two are NEW steps" counts all match; activation lists (4, 3, 4, 2 conditions) all ≥ 2-of-7.

# git status --porcelain

- Before: *(empty — clean)*
- After: *(empty — clean)*
- `diff` of the two captures: byte-identical. Tip unchanged at `77a41f9`. (The only file written anywhere was `/tmp/vault-write-sentence.txt`, which the spec's own Table E gate mandates; nothing in the worktree was touched.)
