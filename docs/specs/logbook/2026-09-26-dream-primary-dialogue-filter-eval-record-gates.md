---
date: 2026-09-26
title: "Gate rounds on the filter's offline-evaluation record (PR #319)"
related_wps: [WP-dream-primary-dialogue-filter]
---

# Gate rounds on PR #319 — the offline-evaluation record

Both gates of `docs/runbooks/codex-review.md` ran on the same tip each round:
the Codex plugin's `adversarial-review` (`--scope branch`, base `c58869bb`,
detached worktree, `CODEX_HOME` unset, raw committed before adjudication) and
`wd-reviewer` on Opus. Materiality bands A/B/C per the runbook.

**Stop criterion (pinned before round 1):** both gates clean or C-only on one
tip → merge; any A or B finding → fix, fresh round on the new tip; a finding
that would change the evaluation's substance (its inputs or its judge) → re-run
that part of the evaluation before the next round, never patch the number.

## Round 1 — tip `97e45ff0`

| gate | raw | verdict | findings (band → disposition) |
|---|---|---|---|
| Codex Astra | `2026-09-26-dream-primary-dialogue-filter-eval-record-r1-astra-raw.json`, committed `bdb17bba` | needs-attention | 1 **B** judge lacked the baseline 09-24 daily log its loss verdict leaned on → **fix**: judge round 2 with the baseline logs (substance re-run, per the criterion); 2 **B** rule simulation not cross-tabbed against the judge's block verdicts → **fix**: exact cross-tab of three rules, one denominator; 3 **B** committed paraphrases of private session substance → **fix**: record rewritten subject-neutral; 4 **C** Codex worker explanation contradicts `primary-dialogue.js` → **fix**: row A4 `thread_source` latch restated, headers of seven rollouts counted |
| wd-reviewer | report in the session (agent hand-back; no raw file — the reviewer is a Claude agent, not the Codex plugin) | REQUEST-CHANGES | 1 **B** Codex mechanism misstated (same as Codex 4) → **fix**; 2 **B** private paraphrases in a public repo (same as Codex 3) → **fix**; 3 **C** "workers project to nothing" heading vs row 7; row 8's 100 % → **fix**; 4 **C** 34.5 % (estimate) beside 28.0 % (exact) without saying so → **fix**: exact 34.6 % recomputed from the judge's block indices, one denominator; 5 **C** contract quote misattributed to the projection → **fix**: cite `WP-dream-primary-dialogue-projection.md:148-150`; 6 **C** advisory: evidence leans Superseded → **fix**: said so; 7 **C** PR body should name the docs-only lane → **fix**: PR body |

What the re-run changed: judge round 2 revised the twenty losses from
3 high / 12 medium / 5 low to **0 high / 9 medium / 7 low / 4 none**; the
cross-tab replaced "four fifths deterministic" with the exact **16.4 %** safe
strip and a **20.8 %** residual; the "re-fed session" story became an
evaluation-design artefact (the live ledger holds both sessions at their
present sizes).

## Round 2 — tip (filled after the round)

_pending_
