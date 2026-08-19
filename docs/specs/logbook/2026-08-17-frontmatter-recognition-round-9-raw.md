---
date: 2026-08-17
title: "WP-frontmatter-recognition-failopen round 9 — adversarial design review, raw output"
related_wps: [WP-frontmatter-recognition-failopen]
---

# Round 9 — adversarial design review (raw)

**Backend:** gptsol.
**Revision reviewed:** `adfc275`.
**Scope instruction given:** the recognition fail-open is an owner-ruled open
residual and must not be re-reported; classify every finding DESIGN-LEVEL or
MECHANICAL, because that classification decides what happens next.
**Read-only property:** verified mechanically on both sides — `git status
--porcelain` empty and byte-identical before and after.
**Committed BEFORE adjudication.**

Everything below the line is the reviewer's final message, verbatim.

---

```json
{
  "verdict": "needs-attention",
  "summary": "NO-SHIP: the revised decision-level contract points in the right direction, but the registration reread still has an undefined rejection outcome, AC2 omits the precondition needed to catch round 8's empty-record regression, and the recognition residual falsely attributes a rejection to the Tier-3 floor. Executed commands: checkout identity and initial `git status --porcelain=v1` capture (exit 0); `npm --prefix /Users/felho/dev/repos-to-learn-from/wienerdog test` (exit 0: 2,015 tests, 2,006 passed, 9 skipped); `npm --prefix /Users/felho/dev/repos-to-learn-from/wienerdog run lint` (exit 0: markdownlint and frontmatter passed; shellcheck and PSScriptAnalyzer skipped because their binaries were absent); targeted `node --test` for dream-validator and digest tests (exit 0: 199/199 passed); current-state `node -e` measurements, four-shape residual probe, registry-shape probe, registration-reread mutant, tracked-reread mutant, round-8 regression mutant, recognition-residual admission probe, and corrected empty-record mutant probe (all exit 0); the first empty-record scratch script had a syntax error (exit 1), then the corrected retry passed; validator call-site, return-flow, reason, banner, and contract-reference grep sweeps ran, with one wildcard grep exiting 2 after encountering directories and its `find`/`xargs` replacement exiting 0; `git diff --stat -- tests/golden/` exited 0 with no output. Final status comparison exited 0: `git status --porcelain=v1` remained byte-identical at zero bytes, branch remained `wp/frontmatter-recognition-failopen`, and HEAD remained `adfc275`.",
  "findings": [
    {
      "severity": "high",
      "title": "The registration reread has no defined fail-closed control flow",
      "body": "DESIGN-LEVEL — the `:1170` row does not say whether “reject” means reverting the vault path or merely declining to insert it into the ownership registry, and those outcomes diverge on the exact reread this row exists to protect. By line 1170, `tier3Decision` has already accepted an earlier read, and registration has no reason-returning helper whose caller performs a revert. The simplest implementation, `if (parse(registrationText).malformed) continue`, rejects only registration; Step 3 then stages and Step 5 commits the malformed bytes. An executed scratch-only mutant implementing that interpretation, while changing a new skill from well-formed to malformed after the Tier-3 read, produced `reverted: []`, committed the malformed skill, and wrote no registry entry. That leaves an ADR-0022-invalid Tier-3 skill committed and potentially usable. AC2 cannot reach this branch by starting with malformed bytes because the earlier Tier-3 decision rejects them first, so its current tests can pass without exercising the reread at all.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 116,
      "line_end": 129,
      "confidence": 0.99,
      "recommendation": "Define the registration-row outcome explicitly: on a malformed reread, revert/remove the changed path, append a fixed code-owned rejection reason to `reverted`, skip registry insertion, and never let those bytes reach staging. Require a test seam that replaces the file between the successful Tier-3 read and the registration reread, then assert all three postconditions: the malformed path is not committed, it is reported as reverted, and no registry entry is written."
    },
    {
      "severity": "high",
      "title": "AC2 omits the registry state required to fail the empty-record design",
      "body": "MECHANICAL — the required regression input does not necessarily fail on the forbidden empty-record implementation because AC2 dropped round 8's degraded-registry precondition. With the test file's normal healthy registry entry containing `id: foo`, emptying both frontmatter views still rejects the revision at `cur.id !== entry.id`; the test therefore stays green by coincidence. An executed empty-record mutant confirmed the split: a healthy registry reverted the path with `skill id does not match the ownership registry`, while the same input with the registry entry's `id` absent committed the revision. AC2a's separate absent-field case does not establish this registry precondition. The accompanying measured claim is also overstated: the current validator returns the first reason, so one invocation does not “report four violations”; with the degraded entry it reports one preservation reason, although four predicates are independently violated.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 210,
      "line_end": 221,
      "confidence": 0.99,
      "recommendation": "Make the regression fixture byte-exact and state-exact: require an ownership-registry entry whose `id` is absent, as in the demonstrated round-8 case, and assert that the empty-record mutant commits while the decision-level implementation reverts. Reword “reports four violations” to “violates four independent invariants,” or require separate inputs that expose each first-return reason individually."
    },
    {
      "severity": "medium",
      "title": "The residual wrongly says the Tier-3 floor rejects an unrecognized HEAD",
      "body": "MECHANICAL — the raise-only row misstates which bytes the Tier-3 floor evaluates. `tier3Decision` reads only the current working-tree revision; it never reads committed HEAD. Therefore an unrecognized HEAD does not make the floor reject when the current revision has recognized, floor-passing frontmatter. An executed probe used a BOM-prefixed HEAD carrying `derived_from_untrusted: true`, a recognized revision lowering it to `false`, and a degraded registry shape that `readRegistry` accepts; `validateAndCommit` committed the lowering revision with no revert. A healthy registry may independently reject some such revisions through the id-preservation checks, but the claimed Tier-3-floor rejection is still false. This gives the successor inaccurate defense-in-depth information about the open recognition bypass.",
      "file": "/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-frontmatter-recognition-failopen.md",
      "line_start": 268,
      "line_end": 275,
      "confidence": 0.99,
      "recommendation": "Split the row by which version is unrecognized: an unrecognized current revision fails the Tier-3 floor, while an unrecognized HEAD plus a recognized floor-passing revision can bypass raise-only and is not rejected by the floor. Name any independent registry/preservation rejection separately and do not describe it as a Tier-3 outcome."
    }
  ]
}
```
