---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen round 7 — adversarial design review, raw output (read-only invariant violated by the relay)"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 7 — adversarial design review (raw)

**Backend:** gptsol.
**Revision reviewed:** `003b87b`.
**Committed BEFORE adjudication.**

## The read-only invariant was violated, and the cause is the relay's

`docs/runbooks/codex-review.md` requires `git status --porcelain` to be
byte-identical before and after the run, or the run is invalid. It was not:
the relay created `2026-08-17-frontmatter-recognition-review-rounds.md`
**while the round was in flight**, so an untracked path appeared mid-run. The
reviewer detected this and declared its own run invalid, which is the correct
call under the rule as written.

Two things follow, and both are stated rather than resolved by assertion:

- The purpose of the invariant — proving the reviewer did not mutate the
  reviewed checkout — is **not** in doubt here. The reviewer reports issuing
  no repository write command and confining scratch files to `/tmp`, and the
  diff is exactly one untracked path, the relay's own file.
- The letter of the invariant is nonetheless broken, so this artifact is
  **not a valid round-7 record**. Its findings are treated below as claims to
  be re-verified independently from a clean tree, not as a gate result.

The lesson is the relay's: do not write into the reviewed checkout while a
review is running, including logbook files that seem unrelated.

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP, AND THIS RUN IS INVALID UNDER THE REQUIRED STATUS INVARIANT: three substantive design defects remain and the enforcing sweep admits a seventh wrong implementation. Execution evidence: initial `git status --porcelain=v1` was empty, with branch `wp/frontmatter-recognition-failopen` and HEAD `003b87b` (all exit 0); the Table B block extracted verbatim from the spec exited 0; both fenced reference scripts extracted verbatim exited 0, with 22/22 cases matching, the round-6 line-13 construction FAIL-CLOSED, all three prose forms plus `---title` unchanged, 387 RECOGNIZED inputs, and all six built-in mutants RED; running those six mutants as standalone processes produced exit 1 for each; the new U+2800-line and false-positive probes exited 0; a shared-recognition-oracle mutant exited 0 while widening recognition; an ASCII-only letter/digit mutant passed the fixed corpus and all six properties with exit 0; the 48-file product-corpus measurement exited 0 with 0 newly fail-closed files; V1 exited 0 with 251/251 tests; `npm test` exited 0 with 2,015 tests, 2,006 passed and 9 skipped; `npm run lint` exited 0, with shellcheck and PSScriptAnalyzer explicitly skipped because their binaries were absent; `git diff --stat -- tests/golden/` exited 0 with no output. No repository write command was issued and scratch files were confined to `/tmp`, but the final status comparison exited 1 because `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/logbook/2026-08-17-frontmatter-recognition-review-rounds.md` appeared untracked during the run; branch and HEAD remained unchanged. The review must therefore be rerun from a stable checkout before it can serve as the valid round-7 artifact.",
  "findings": [
    {
      "severity": "high",
      "title": "A U+2800-only first line still hides the delimiter attempt on line 2",
      "body": "DESIGN-LEVEL — the one-line predicate leaves a new construction that carries the canonical security flag into the trusted class. U+2800 is not removed by the specified invisible-character union, so in `U+2800 + LF + --- + LF + derived_from_untrusted: true + LF + ---`, the U+2800-only line becomes the first non-empty line; because that line has no hyphen run, the predicate returns false and never examines the exact delimiter attempt on line 2. The executed probe reported `attempt=false`, `class=no frontmatter`, `todayExclusion=null`, and `bodyInjected=true`, whereas the round-6 same-line U+2800 construction now correctly reports FAIL-CLOSED. This preserves a silent digest/snapshot admission using the exact invisible character the revision claims cannot evade the rule.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 183,
      "line_end": 206,
      "confidence": 0.99,
      "recommendation": "Replace the exactly-one-line decision with an explicitly terminated leading-region rule that cannot be stopped by a symbol-only visually blank line. At minimum, continue past lines containing neither a letter, digit, nor hyphen candidate, and add the exact U+2800-only-line construction to the case corpus and every protected consumer test."
    },
    {
      "severity": "medium",
      "title": "The structural predicate excludes ordinary leading dividers and ASCII art",
      "body": "DESIGN-LEVEL — `contains /-{3,}/ and contains no letter or digit` is materially broader than a delimiter shape. Executed probes classified a leading Markdown horizontal rule (`---` with no closer), `+-----+`, `|---|---|`, and `—---—` as FAIL-CLOSED even when followed only by ordinary prose; today's parser returned `exclusion=null` and preserved the note. These are plausible dividers, table/box rules, and decorative separators rather than attempted frontmatter, so existing user notes can disappear from digest and snapshot inputs after upgrade. The measured zero hits in 48 shipped files does not bound user vaults, and the spec's migration-cost discussion mentions Windows/artifact notes without exposing this broader content-shaped exclusion.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 183,
      "line_end": 209,
      "confidence": 0.96,
      "recommendation": "Re-rule the candidate grammar so arbitrary punctuation containing a hyphen run is not sufficient. Distinguish delimiter-shaped candidates from leading thematic/ASCII-art content, add these measured negative cases, and explicitly validate the remaining migration cost against representative user-vault content rather than only the shipped corpus."
    },
    {
      "severity": "high",
      "title": "P5 uses the same recognition oracle as the classifier it claims to check",
      "body": "DESIGN-LEVEL — the committed proof shape contradicts P5's independence requirement and permits recognition widening to remain green. In the reference sweep, `makeClassifier` calls `recognized(t)` and P5 computes its expected value by calling that same `recognized(t)` function. An executed mutant changed this shared helper to recognize CRLF delimiters (`---\\r`) while leaving the sweep otherwise intact; the supposedly correct classifier remained green with P1–P6 all zero, despite recognizing inputs the frozen byte-exact contract forbids. The six named mutants still went RED because they disagree with the shared helper, so their red output does not detect corruption of the common oracle itself.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/logbook/2026-08-17-frontmatter-recognition-reference-classifier.md",
      "line_start": 124,
      "line_end": 147,
      "confidence": 0.99,
      "recommendation": "Require and demonstrate two structurally separate implementations: the classifier under test may use its production recognition helper, while P5's oracle must independently spell the frozen `line 0 === '---'` plus later exact-closer predicate and must not call or import that helper. Add a shared-oracle recognition-widening mutant that changes only the classifier-side predicate and is required to exit non-zero."
    },
    {
      "severity": "medium",
      "title": "An ASCII-only letter/digit implementation passes the corpus and all six properties",
      "body": "MECHANICAL — the contract's Unicode `\\p{L}`/`\\p{N}` rule is sound, but the generator never exercises the distinction from ASCII-only classes. An executed seventh mutant replaced the classifier's Unicode guard with `[A-Za-z0-9]`; all 22 fixed cases still matched and the 50,000-input sweep reported P1–P6 all zero with 387 recognized inputs. The mutant wrongly classified both `é---` and `１---` as FAIL-CLOSED even though the contract classifies them as no frontmatter. This permits an easy implementation mistake to exclude international prose while satisfying the advertised evidence.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/logbook/2026-08-17-frontmatter-recognition-reference-classifier.md",
      "line_start": 151,
      "line_end": 175,
      "confidence": 0.98,
      "recommendation": "Add deterministic non-ASCII letter and number cases adjacent to an ASCII hyphen run, include Unicode `L` and `N` tokens in the balanced generator, and require the ASCII-only seventh mutant to exit non-zero."
    }
  ]
}
```
