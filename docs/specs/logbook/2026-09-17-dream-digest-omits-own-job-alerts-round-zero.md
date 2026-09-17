---
date: 2026-09-17
title: "Round zero: WP-dream-digest-omits-own-job-alerts re-derived against post-#245 main"
related_wps: [WP-dream-digest-omits-own-job-alerts, WP-dream-lock-stale-owner-loud, WP-dream-live-owner-lock]
---

# Round zero — WP-dream-digest-omits-own-job-alerts

Architect's own re-measurement and internal coherence pass
(`docs/runbooks/codex-review.md`, "Template conformance" / "Internal coherence
pass"). The spec was filed 2026-09-10 against `5cb4e49b`; PR #245 has since
merged 51 commits. Every claim below was re-derived at **`b4af715e`**
(`origin/main`), in the worktree
`/Users/gyulafeher/Documents/Claude_Projects/wienerdog/.claude/worktrees/agent-a4477a765c909af76`
(branch `docs/ready-dream-digest-omits-own-job-alerts`), which adds
**documentation only** — no `src/` or `tests/` change. No measurement mutated
the worktree: the both-directions gate runs below used synthetic diff files and
a `sed` copy under the session scratchpad.

The spec stays `status: Draft`. This pass does not substitute for the
clean-context template-conformance executor, which by the runbook must be an
executor that took no part in drafting; that one is still owed.

## What moved, and why

`git diff --stat 5cb4e49b..b4af715e` over every file this spec cites touches
**two**: `src/cli/dream.js` (+83/−54) and `tests/unit/dream-pipeline.test.js`.
`src/cli/run-job.js`, `src/core/alert-ack.js`, `src/core/digest.js` and
`src/cli/sync.js` are byte-identical to the filing base, so every citation into
them that has drifted was wrong when filed, not rotted since.

| Claim | Filed | Re-derived at `b4af715e` |
|-------|-------|--------------------------|
| `dream.js` length | 1218 | **1233** |
| `regenerateDigest` closure | l.628-647 | **l.641-660** (both ends checked: `const regenerateDigest = () => {` / `};`) |
| alerts input expression | l.633 | **l.646** |
| render site 1 (quarantine-only refresh) | l.705 | **l.724** |
| render site 2 (step 19) | l.1167 | **l.1182** |
| `WIENERDOG_DREAM_RUN_TOKEN` read | l.812 | **l.827-828** |
| `run-job.js` `resolveCommand` | "l.439" attached to the function name | function at **l.433**; the `builtin:dream` arm's `node <bin> dream --yes` return is at **l.439** — the number was right, the antecedent was not |
| B1 success marker | l.1187 (`try {`) | **l.1188** (`jobsLib.writeScheduleState(…)`) |
| `dream-pipeline.test.js` length | 2039 | **2220** (the cited case at l.829 did not move) |

Unchanged and re-confirmed by grep: `sync.js` l.278; `alert-ack.js` l.125-127
and l.131; `digest.js` `formatAlerts` l.486-513 with the frozen sentence at
l.509; `run-job.js` l.150 / l.180 / l.219 / l.692 / l.953 / l.1036 / l.1204 /
l.1343 / l.1494; `scheduler-runjob.test.js` 3026 lines.

New facts the spec did not previously carry: `dream.js` requires no
`../scheduler/jobs` today (require block l.3-39), so the cross-check adds one;
and `src/scheduler/jobs.js` `listJobs` (l.199-208) wraps `readConfig` in
`catch { return []; }`, which gives Table A's config-read failure direction by
construction rather than by the implementer's care.

## Did #245 add a path that matters to this contract?

Three arms sit between the lock and the step-19 render. Only one is new.

- **`owner-unknown` lock throw (l.595-600) — NEW.** Non-zero exit, nothing
  rendered, `run-job` fails loud. The filter never runs, so the contract is
  unaffected; the spec now says so in Table A's "Paths that render nothing"
  row instead of leaving it to inference.
- **Declined-lock (`busy`) exit-0 return (l.601-602) — NOT new.** The pre-#245
  code had the same `console.log(…); return;` and #245 changed only the message
  string. It still means `run-job` certifies a success, writes the marker and
  calls `clearAlerts(paths, 'dream')` although no dream body ran, while the
  digest — never rewritten on that path — can keep showing a callout whose
  record has just been deleted. **Out of scope here**, and named to
  `WP-dream-lock-stale-owner-loud`: it is present identically before and after
  this WP, it lives in the supervisor's contract, and folding it in would make
  this package two concerns.
- **No-complete-input throw (l.736-743) — NOT new, but WIDENED.** It was the
  capacity wedge (`sel.dropped.length > 0`); #245 broadened the trigger to four
  causes assembled at l.683-700. It sits **after** render site 1, so a run can
  render and then fail. The spec's Named residual previously enumerated only
  "throws after step 19"; that enumeration is now wrong by omission and has been
  widened, with a Table A row ("Render-then-fail") owning the fact and the
  residual citing it.

## Both-directions runs for the new verification steps

Run on the untouched tree at `b4af715e` (no implementation exists yet), so V3/V5
are green-by-construction and V4/V6 are the red-before-work side.

| Step | absent | violating | compliant |
|------|--------|-----------|-----------|
| V3 (comment-only diff shape) | n/a — guarded by `test -f`, same shape as V4 | **rc=1** (synthetic diff with one executable line) | **rc=0** (synthetic comment-only diff) |
| V4a (narrowed claim present once) | — | **rc=1** on the untouched file | **rc=0** on a `sed` copy carrying the narrowed sentence |
| V4b (old universal gone) | **rc=1** on a missing path | **rc=1** on the untouched file | **rc=0** on the same copy |
| V5 (`digest.js` unmoved) | — | — | **rc=0** |
| V6 (declaration ids) | **rc=1** (file absent) | — | asserted by the implementer's run |

V4b's absent case is the one the runbook warns about — a negated grep passes
hardest when the file is gone — and the `test -f` guard turns it red, measured.

## Owner items

O1 (trusting `WIENERDOG_JOB` under the config cross-check) and O2 (a single
containment-probe retry) are written into the spec under "Dispatch precondition
— owner items" as question / recommendation / overrule cost. **Neither has been
ruled on.** The single ruling on record is the 2026-09-10 maintainer ruling that
this WP ships before the managed-policy-warning follow-up; it governs that
follow-up only.
