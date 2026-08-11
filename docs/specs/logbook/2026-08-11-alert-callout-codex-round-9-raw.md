# Codex adversarial review — round 9, the closing round (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msoqtb8l-pxmwa8
Run after the owner's identifiability ruling. Closure test per the weighted rule.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

No-ship: the spec still contains an unsatisfiable universal, a false refusal consequence, and stage-ambiguous Table A rules.

Findings:
- [high] Byte-starvation criterion is false for unchanged starvation inputs (docs/specs/WP-neutralize-alert-callout-rendering.md:442-449)
  The measured half universally says that on inputs which starve the body today, strictly more body survives. A sufficient number of distinct alerts containing only safe, within-budget ASCII fields starves the body today and must render byte-identically after the change under the Template contract; therefore the body remains equally starved. The six-job astral-Cf measurement proves only its named scenario, not the stated class. A correct implementation cannot satisfy the criterion literally.
  Recommendation: Restrict the strict-improvement claim to the exact measured input already named, and describe the general guarantee only as preserving the worst-case per-field ceiling.
- [medium] Refused reasons are not uniformly recoverable from a per-run log (docs/specs/WP-neutralize-alert-callout-rendering.md:240)
  The ruling says that when a reason is refused, its raw detail is in the per-run log. The current tree has a direct policy-hook appendAlert call in src/cli/run-job.js with log_hint set to an empty string, before the per-run log is opened; this same Table A row acknowledges that its reason can be unbounded. A refused policy-hook reason therefore has no promised per-run-log recovery. Log-creation failure paths provide the same counterexample. Recovery through alerts.jsonl and `wienerdog alerts` still exists, but the consequence argument as written is false.
  Recommendation: State that per-run-log recovery applies only where a log was actually written, and use alerts.jsonl/`wienerdog alerts` as the uniform recovery path for refused reasons.
- [medium] Several Table A rules still leave the rendering stage implicit (docs/specs/WP-neutralize-alert-callout-rendering.md:232-236)
  Despite the preceding assertion that every rule names its stage, the Unsafe set, Relation to the break set, TAB, and Denylist rows only say values are escaped or passed through. Those statements are true of the encoded form but false for an over-budget emitted field, where neither tokens nor pass-through bytes appear because the entire value is replaced. This recreates the exact encoded-versus-emitted ambiguity the two-stage contract is intended to eliminate.
  Recommendation: Explicitly label these rows as encoded-form rules and state that the emitted field remains governed by the subsequent budget decision.

Next steps:
- Narrow the byte-starvation acceptance criterion.
- Correct the refusal recovery rationale.
- Make every affected Table A row stage-explicit.

Codex session ID: 019ff12d-d9f9-7f23-904b-d289b7e8a900
Resume in Codex: codex resume 019ff12d-d9f9-7f23-904b-d289b7e8a900
```
