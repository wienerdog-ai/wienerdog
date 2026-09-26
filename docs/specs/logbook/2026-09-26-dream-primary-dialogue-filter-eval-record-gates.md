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

## Round 2 — tip `bedfbaa0`

| gate | raw | verdict | findings (band → disposition) |
|---|---|---|---|
| Codex Astra | `…-eval-record-r2-astra-raw.json`, committed `f3a12438` | needs-attention | 1 **B** the decision analysis attributed all 16 remaining losses to the repeat-pass artefact although 4 came from sessions new to the baseline → **fix**: the two groups separated (12 repeat-pass; 4 first-pass omissions, 3 medium + 1 low), faithfulness restated as "faithful, with gaps", the one consolidation finding reframed as the production first-pass defect; handover aligned |
| wd-reviewer | report in the session | REQUEST-CHANGES | round-1 items 1–6 verified fixed (7 pending in the PR body); new: 1 **B** `npm run lint` failed on this record's own placeholder (MD036) → **fix**; 2 **B** the same misattribution the Codex gate found, plus the registered finding framed around the setup instead of the production defect → **fix**: one finding, "a first pass records totals and to-dos and scores the rest near-zero novelty on an unchecked assumption"; 3 **B** the round-1 paraphrases remain in branch history and this repo merges with merge commits → **owner**: the session's permission layer refused a history rewrite (`reset --hard` + force-push), so the branch keeps `97e45ff0`; the maintainer chooses at merge time — squash-merge keeps that commit out of `main` but retracts nothing already published (the remote branch and the PR ref still reach it), a rewrite plus a removal request to GitHub is his own act; stated in the handover; 4 **C** the 20.8 % residual mislabelled machine-session concluding replies as interim replies → **fix**: split 11.1 % machine sessions whole / 9.6 % interim replies, exact; nit: "or none" for `thread_source` → **fix** |

**No history rewrite was made.** The raw commits cited above (`bdb17bba`,
`f3a12438`) were made before adjudication, as the runbook requires, and stay
where they are. A squash-merge would leave them reachable through the remote
branch (until deleted) and the PR's ref (which persists for the life of the
repository; only GitHub Support purges it) — **at a cost this record names:**
the runbook wants each raw-commit SHA cited as proof the raw preceded
adjudication, and under a squash those SHAs are provable only off `main`
(the raw files themselves still land on `main` inside the squash commit). A
merge commit would carry `97e45ff0` into `main`. That trade is the
maintainer's.

## Round 3 — tip `d00aee11`

| gate | raw | verdict | findings (band → disposition) |
|---|---|---|---|
| Codex Astra | `…-eval-record-r3-astra-raw.json`, committed `a8f2823e` | needs-attention | 1 **B** the handover's squash-merge guidance understated the published commit's reachability (remote branch, PR ref; no basis for "until GitHub drops it") → **fix**: stated accurately, removal named as a separate owner decision; 2 **B** the decision-rule item still called the twelve live omissions an artefact → **fix**: the restatement deleted, the item now assesses faithfulness against all 16 production omissions as Findings A describes them (repeat rule: third round on the same sentence family, so the sentence was removed rather than patched) |
| wd-reviewer | report in the session | **APPROVE** (C-only) | round-2 items 1–4 verified fixed; C1 decision-rule item still contradicted Findings A → **fix** (the restatement deleted, see the Codex row); C2 this record said "a second consolidation finding" in one row and "one" elsewhere → **fix**; C3 merge text: the PR ref persists for the life of the repository (Support-only purge), the branch stays reachable until deleted, and a squash costs the on-`main` provability of the raw-commit SHAs → **fix**: all three stated; C4 the handover understated what `97e45ff0` holds → **fix**: "item-level topic phrases (about a dozen) from the sessions and the 09-24 daily log; no verbatim transcript or note text"; C5 advisory: state the 12/4 split once → **done** with C1 |

## Round 4 — tip filled after the round

Pending.
