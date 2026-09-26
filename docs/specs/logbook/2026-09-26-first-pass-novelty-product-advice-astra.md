---
date: 2026-09-26
title: "Product advice on WP-dream-first-pass-novelty — independent memo from gpt-6-astra (Codex plugin, effort high)"
related_wps: [WP-dream-first-pass-novelty, WP-dream-primary-dialogue-filter]
---

# Product advice on the first-pass novelty question (2026-09-26)

Commissioned by the owner ("spawn a product advisor agent using codex and astra
high model, then circle back with its recommendation"). Run through the Codex
plugin's `task` runner, `--model gpt-6-astra --effort high`, read-only, in the
repository root; it read VISION, PRD, THREAT-MODEL, the dream skill, the stub and
the offline-evaluation record, nothing else. The memo below is the model's output
verbatim (link syntax left as written). The owner's ruling on it, when given, goes
into a dated rulings entry, not here. Also recorded the same evening: the owner
ruled **no purge request** for PR #319's first commit `97e45ff0` after the
verbatim inventory of its phrases was shown.

---

## 1. The question, restated in product terms

**Should users accept losing useful context overnight to keep memory concise—or pay modestly more for the dream to verify that context is actually preserved?**

The promise is continuity: future sessions know “where we left off,” and overnight consolidation preserves durable facts without ongoing user effort. ([PRD, “User stories”](docs/PRD.md); [VISION, “What success looks like”](docs/VISION.md).)

**Measured:** the nine-session evaluation identified 16 omissions: **0 high, 9 medium, 7 low**. Twelve originated in an earlier live dream; four arose in the evaluation. The judge attributed all to unchecked “already written elsewhere” assumptions; none came from input noise. This establishes a failure mechanism, not a population-wide loss rate. ([Evaluation, “Findings A”](docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md).)

An unchanged session is not processed again, so these omissions have no automatic second chance. Candidate (i) would prevent unjustified dismissal; candidate (ii) would preserve material for possible later recovery. ([Candidate WP, “Context” and “The two candidate closures”](docs/specs/WP-dream-first-pass-novelty.md).)

## 2. Options

The benefits and incremental costs below are **my judgment**, grounded in the documented behavior.

| Option | Benefit to the user | Cost to the user |
|---|---|---|
| **Do nothing** | Preserves current nightly cost and concision. | No incremental model work, storage, reading or provenance surface; accepts known omissions and possible repeated explanations. |
| **(i) Check novelty against actual notes** | Protects useful context at its first opportunity to become memory. | More targeted reads and model work; some additional note content and reading. No new persistent input channel, although additional writes still carry ordinary provenance risks. |
| **(ii) Per-session “left out and why,” reread later** | Gives omissions a possible second chance when the topic returns. | More nightly writing and subsequent reading, continuing report growth, and potentially another review burden. Recovery is delayed. Model-written summaries become inputs whose original trust flags need preservation or conservative treatment. |
| **Alternative: automatically retain medium-value material in concise project context** | Could preserve rationale and constraints even when novelty is not the reason for rejection. | Likely broader model work, vault growth and reading burden; risks retaining speculation and duplicates. “Medium severity” would first need a usable product definition. |
| **Alternative surface: improve the existing report** | Makes decisions inspectable without creating another record. | Modest reporting work and growth, optional reading; limited benefit if candidates never reach the report. Automatic rereading would reintroduce option (ii)’s trust problem. |

Candidate (i)’s additional reads and candidate (ii)’s provenance hazard are documented, not measured treatment costs. The report already requires **every unwritten candidate** under “Gated out (and why)”; whether the 16 omissions appeared there is unknown. ([Candidate WP, “What already exists” and “The two candidate closures”](docs/specs/WP-dream-first-pass-novelty.md); [Dream skill, “Dream report”](skills/wienerdog-dream/SKILL.md).)

Any expansion must respect the threat model: model output is only partially trusted, and persistent memory can carry injected instructions forward. Ordinary-note provenance remains partly a model assertion. ([Threat model, “Trust boundaries,” “T1” and “Residual risks”](docs/THREAT-MODEL.md).)

## 3. Recommendation

**Choose candidate (i), evaluated at the level of a useful observation—not whether a session received a summary. Defer candidate (ii).**

My product judgment: losing medium-value context because it was deliberately judged unhelpful can be acceptable; losing it because the dream falsely assumed it was preserved is not. A total or to-do does not necessarily preserve the decision’s rationale, constraint or unresolved question.

This is the narrowest intervention matching every observed loss mechanism. It also supports the product’s stated differentiation—curation quality—without creating a continuing second collection of model-written omissions. ([PRD, “Key risks”](docs/PRD.md).)

Do **not** lower thresholds yet. Novelty is only one of six ranking signals; significance, durability and actionability still matter. Existing tier and provenance gates should remain intact. ([Dream skill, “Phase 2 — Rank” and “Phase 3 — Consolidate”](skills/wienerdog-dream/SKILL.md).)

**Smallest cheap test:** commission a paired pilot on the two sessions new to the evaluation baseline that produced omissions. Compare unchanged behavior with candidate (i), using identical starting notes and inputs. Everything substantive stays in a disposable vault on your machine; only aggregate results enter the repository. Inspect the existing gated-out reports during the same exercise. These conditions follow the recorded privacy boundary. ([Evaluation, “Setup” and “Findings A”](docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md).)

Measure useful omissions recovered, duplicates, unsupported claims, added note length and model work. Judge against both transcripts **and actual notes**. A favorable pilot warrants broader testing with genuine pre-consolidation baselines—not immediate release.

## 4. What to decide now vs later

- **Now — retention:** accept modest additional work and text to prevent unsupported novelty-based rejection of useful context.
- **Now — omission records:** retain the existing report; defer a new persistent, automatically reread record.
- **Now — success:** require useful recovery without additional medium/high unsupported claims; agree a cost ceiling before testing.
- **Later — design:** choose evidence format, lookup bounds and report presentation after the pilot.
- **Later — broader policy:** consider medium-material defaults or recovery records only if verified novelty leaves consequential gaps.

## 5. Risks and what would change your mind

Candidate (i) is a model instruction, not mechanically enforced verification. ([Candidate WP, “The two candidate closures”](docs/specs/WP-dream-first-pass-novelty.md).) It could produce superficial checking, excessive searching or duplicate notes.

I would reconsider if repeated local tests show little useful recovery, substantial cost, or worse factual precision. I would favor candidate (ii) only if consequential omissions persist and existing reports demonstrably cannot support recovery safely.

**Executive summary:** Require the dream to verify “already remembered” against the actual notes before discarding useful context. Test that narrow change locally before adding omission ledgers or broadening retention defaults.
