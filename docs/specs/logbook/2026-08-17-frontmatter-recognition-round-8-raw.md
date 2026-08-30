---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen round 8 — adversarial design review of the NARROWED package, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 8 — adversarial design review (raw)

**Backend:** gptsol.
**Revision reviewed:** `330bf54` — the package narrowed by fallback (A) after
round 7: four deliverables, size S, `src/core/frontmatter.js` explicitly not
among them, and the recognition fail-open carried as an owner-ruled open
residual.
**Scope instruction given:** do NOT re-report the recognition fail-open, which
is disclosed rather than overlooked; DO report it if the residual is
dishonest. Classify every finding DESIGN-LEVEL or MECHANICAL.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after. **This is a valid
round**, unlike round 7, which the relay invalidated by writing into the
checkout mid-run.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the empty-record validator contract still permits the exact vacuous security-check failure AC2 claims to prohibit, and the recognition residual materially overstates the dream validator's exposure. Executed commands, all exit 0: initial `git status --porcelain=v1`, `git branch --show-current`, `git rev-parse HEAD`, and spec `wc -l` target checks; `find tests/golden` plus `/usr/bin/grep` banner and validator-call-site sweeps; `npm --prefix /Users/felho/dev/repos-to-learn-from/wienerdog test` (2,015 tests: 2,006 passed, 9 skipped); `npm --prefix /Users/felho/dev/repos-to-learn-from/wienerdog run lint` (markdown and frontmatter checks passed; shellcheck and PSScriptAnalyzer were skipped because their binaries were absent); `node --test /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/dream-validate.test.js /Users/felho/dev/repos-to-learn-from/wienerdog/tests/unit/digest.test.js` (199/199 passed); four `node` probes covering the residual shapes, daily exclusions/banner, current-state measurements, and the empty-record mutant; and `git diff --stat -- tests/golden/` (empty). Final `git status --porcelain=v1` compared byte-identically with the initial capture; branch remained `wp/frontmatter-recognition-failopen` and HEAD remained `330bf5445e69ee10a89bec5dd0b39b92dbe0ed18`.",
  "findings": [
    {
      "severity": "high",
      "title": "The empty-record contract cannot itself make preservation checks fail closed",
      "body": "DESIGN-LEVEL — the mandated empty record erases the distinction between a missing field and a field hidden by malformed frontmatter, so the stated one-guard implementation cannot satisfy AC2 without an additional, unstated failure contract. At the affected checks, two empty views make `cur.origin !== head.origin`, `cur.created !== head.created`, and `cur.id !== head.id` evaluate false, while an empty HEAD also disables the raise-only condition because `head.derived_from_untrusted === true` is false; registration at line 1170 likewise converts an empty reread into default values rather than rejecting it. An executed scratch-only mutant adding exactly the specified `if (fm.malformed) return {}` demonstrated a concrete authorization regression: with a degraded registry entry, a malformed committed HEAD skill containing protected `id`, `origin`, and `created` values, and a floor-passing authorized revision that omits those values, today's guard returned `skill revision changed origin (must be preserved)`, while the specified implementation returned `null`. The current revision still satisfies the downstream Tier-3 floor, so protected provenance that is rejected today can be admitted. The spec notices the vacuous-pass trap at lines 143-146 but supplies no representation or mandatory branch by which consumers can distinguish malformed from genuinely absent fields; this also conflicts with the claim that only one guard and no API-shape change are needed.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 101,
      "line_end": 107,
      "confidence": 0.98,
      "recommendation": "Replace the empty-record-only contract with an explicit tagged result or failure sentinel that preserves `malformed`, and require every security decision to reject that state before field comparisons or defaults. Specify separate behavior for malformed HEAD, malformed current bytes, both malformed, a degraded registry entry, and the registration reread at line 1170; cover a file change between the Tier-3 read and registration as well. Update the Deliverables note, Contract reference, AC2, and red-run instructions to acknowledge the required consumer branches or API-shape change."
    },
    {
      "severity": "medium",
      "title": "The residual falsely says unrecognized blocks pass the dream validator",
      "body": "MECHANICAL — the residual overstates the open recognition defect by saying every listed leading shape reads as trusted at the dream validator. The validator's Tier-3 path requires `confidence`, `recurrence`, and `derived_from_untrusted`; when recognition fails, `parseFrontmatter` returns an empty record and the `hasAll` check rejects the write as missing provenance. Executed probes for a UTF-8 BOM opener, a CRLF block, a leading blank line, and an opener without a closer each reported `delimited:false`, exposed zero validator fields, and produced `floorPasses:false`. Recognition still fails open at the disclosed digest paths, but the dream gate does not admit these shapes, so the residual conflates trusted-by-default digest behavior with the dream's stricter schema and hands the successor an inaccurate cross-consumer invariant.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 207,
      "line_end": 224,
      "confidence": 0.99,
      "recommendation": "Remove the dream validator from the claim that every listed shape reads as trusted. State instead that these shapes make the field invisible there and are rejected by the Tier-3 missing-provenance check. Keep only consumer outcomes that were independently reproduced, naming the exact path and observed admission or rejection for each."
    }
  ]
}
```
