# Handover — audit remediation state and remaining work

Written 2026-08-31 at the close of the promote-in family (PRs #55/#57/#60/#61).
This is the entry point for the developer taking over. Everything you need is
in this repository; there is no side channel.

## Read in this order

1. `CLAUDE.md` — how work happens here (spec-driven, one WP at a time).
2. `docs/GLOSSARY.md` — canonical names; never invent synonyms.
3. `docs/specs/README.md` + `docs/specs/_TEMPLATE.md` +
   `docs/runbooks/spec-authoring.md` — the spec system.
4. This file — where the audit remediation stands and what remains.
5. `memory/lessons/inbox.md` — paid-for lessons; the last 13 bullets
   (`WP-dream-promote-in-workspace:` prefix) are the distilled discipline of
   the hardest package.

## Audit remediation status (measured on main, 2026-08-31)

The security audit ruled five remediation groups. Status, measured from the
tree (`docs/specs/done/` + merged PRs), not from memory:

| Group | Subject | Status |
|-------|---------|--------|
| A | Interpolation neutralizer for code-owned markdown control planes | **Done** — `WP-sanitize-project-display-names`, `WP-daily-summary-per-line-framing`, `WP-neutralize-alert-callout-rendering` in `done/` |
| B | Vault-snapshot second path into model sessions | **Done** — `WP-gate-vault-snapshot`, `WP-snapshot-read-path-hardening` in `done/` |
| C | Dream write fence (machinery-controlling files) | **Done — E2 disposition act, 2026-09-06** (D1 (c) CLOSED by `WP-instruction-basename-currency`, #211; D1 (b) and D5 CLOSED by `WP-dot-segment-denial`, #215; D2 (b) and D4's env half CLOSED by `WP-dream-git-env-pinning`, #234; D4's second spawn point CLOSED by `WP-dream-git-env-validate-seam`, #238) — every group C mechanism retired or accepted, measured on `eedd8783`. **Three residuals ACCEPTED, not retired, each with a home that owns it:** the `reference-transaction` hook (`WP-dream-promote-in-workspace` Table W row W1, owner ruling of 2026-08-31, not reopened); the nested vault (`WP-dream-git-env-validate-seam` owner item O5, named in `assertGitRepo`'s contract); an undocumented tool's instruction file (the currency WP's dated inventory, its owner and its trigger). Basis in `docs/specs/logbook/2026-09-06-audit-group-c-closure.md`; per-finding disposition in `docs/specs/logbook/2026-09-02-audit-group-c-disposition.md` |
| D | Code-derived draft recipients (no verb accepts a model-named address) | **Done** — `WP-audit-d-code-derived-recipients` in `docs/specs/done/` |
| E | Ledger-parser correctness + hostile corpus | **Done** — `WP-audit-e-ledger-parser-corpus` in `docs/specs/done/` |

**The five audit groups now read: A Done, B Done, C Done, D Done, E Done** — group
C closed by the E2 disposition act of 2026-09-06 with three residuals accepted
rather than retired (the `reference-transaction` hook, the nested vault, an
undocumented tool's instruction file), each named with the home that owns it in
`docs/specs/logbook/2026-09-06-audit-group-c-closure.md`.

Two known status anomalies at handover time:
`docs/specs/WP-ep2-unscannable-preserve.md` was still In-Review after its PR
(#57) merged — a done-flip PR accompanies this handover.
`docs/specs/WP-contract-reference-tables.md` sits In-Review; its
implementation state was not re-verified during handover — measure before
resuming it.

## The remaining work, in recommended order

> **▶ START HERE — 2026-09-26 evening: the filter's offline evaluation is DONE; one owner ruling is open.**
> Measured on `main` at `c58869bb` plus PR #319. No agent running, no
> worktree of this session left. The disposable evaluation root `~/wd-eval/`
> (0700, owner's machine only) is left in place for inspection — the judge
> verdicts are `~/wd-eval/judge/verdict.md` and `verdict-r2.md`; deleting
> the root is the owner's act.
>
> **WHAT WAS DONE.** Nine of the owner's own sessions (six Claude, three
> Codex; 857,445 intake bytes → 120,652 projected bytes) went through the
> installed 0.15.0 dream against a clone of the live vault at `b817b12`
> (204 s, brain `claude-opus-5-5`, 5 notes), and a separate
> `claude-opus-5-5` judge at high effort read the projected dialogue, the
> pre-run notes and the diff in two rounds (383 s + 96 s; the second round,
> with the baseline daily logs visible, was owed to the Codex gate on the
> record). Record:
> `docs/specs/logbook/2026-09-26-dream-primary-dialogue-filter-offline-evaluation.md`
> (identities, counts, verdicts — no transcript or note substance; the repo is
> public). The result block at the spec's entry condition points to it. **MERGE DECISION FOR THE
> OWNER (PR #319 is not merged):** its first commit (`97e45ff0`) carried
> item-level topic phrases from the sampled sessions and the 09-24 daily log
> (about a dozen; no verbatim transcript or note text); the gates caught it
> and the text is gone from the tip. The session's permission layer refused a history
> rewrite, so the commit is still in the branch, **and it is already
> published**: it is reachable through the remote branch
> `docs/filter-offline-evaluation-2026-09-26` and through the PR's ref.
> **Squash-merge** only keeps it out of `main`; it retracts nothing: the
> branch reaches it until deleted, and the PR ref persists for the life of
> the repository (only GitHub Support purges it). Its cost: the three Codex
> raw commits the round record cites as proof-before-adjudication are then
> provable only off `main` (the raw files still land in the squash commit).
> A **merge commit** carries `97e45ff0` into `main` as well. Removing the
> published material is a separate decision — a rewrite and force-push plus
> a Support request — and the owner's own act. Recommended: squash-merge,
> then decide separately whether the exposure warrants the removal request. The
> evaluation's own two harness transcripts were moved out of
> `~/.claude/projects/` into `~/wd-eval/harness-transcripts/` so tonight's
> live dream does not consolidate evaluation artefacts; the live ledger was not
> edited.
>
> **RESULT IN ONE PARAGRAPH.** The judge marked 41 of 71 blocks (34.6 % of the
> projected characters, exact) not worth remembering, found that this material
> caused mild dilution plus one low-severity error (five instances in four
> notes; the record's Findings C), that no loss sits inside it, and rated a
> block-selection filter **MARGINAL**; with the baseline visible, no
> high-severity loss or unsupported claim remained. A prefix count shows
> 16.4 % of the characters (35 of 132 messages) are harness task notifications
> and local-command echoes passing through as `user` records — a fixed rule
> removes them against the projection's Done contract with nothing kept lost;
> the filter's remaining target is 20.8 %: the three machine-authored sessions
> whole (11.1 %, behind two of the dilutions and the one error) and interim replies
> inside the human-driven sessions (9.6 %) that left no trace in the notes; no
> positional rule removes the interim replies safely (two were measured). The 16 remaining losses (0 high) are all
> one first-pass defect — totals and to-dos recorded, the rest scored
> near-zero novelty on an unchecked assumption that it is written elsewhere:
> 12 made by the live 09-24 dream (re-exposed by the evaluation's empty
> ledger; production never re-feeds an unchanged session) and 4 (three medium,
> one low) made by this run on two new sessions; none sits in a low-value
> block, so a filter cannot touch them. Codex rollouts whose header carries a `thread_source` other than `"user"`
> (an absent key is also eligible) project to zero by design (row A4).
>
> **OWNER RULING NEEDED (one line):** the evidence leans to the spec's *not
> material* branch, but the number is not negligible and the parking was the
> owner's. Recommended: **supersede `WP-dream-primary-dialogue-filter`;
> wd-architect files the deterministic strip (task-notification and
> local-command `user` records) as a fix against the projection's Done
> contract, and a candidate package for the first-pass novelty finding.** Until the
> ruling the spec stays `Draft`, parked as before.
>
> **DO NEXT (unblocked): `WP-vault-write-cas-window` design round** —
> wd-architect (Opus, high) → Codex design gate → `Ready` → dispatch-time
> re-verification → implementer on Opus-high → both PR gates. The block below
> still describes it correctly.
>
> **Housekeeping noticed, not done:** two `Superseded` stubs sit in the specs
> root (`WP-adr-0019-quarantine-uninstall-export`,
> `WP-ep2-atomic-withhold-handoff`) although `docs/specs/README.md` says a
> Superseded spec moves to `done/`; the earlier block below counted one.
>
> **Session close 2026-09-26 (earlier block, kept as the record of how the day got here).**
> Measured on `main` at `6f66ce7f`. No PR open, no agent running, no worktree of
> this session left (the `prunable` worktrees under an older session's
> scratchpad and the `wienerdog-a9a10/` and `wienerdog-felho/` checkouts predate
> today and were not touched).
>
> **STATE.** `wienerdog@0.15.0` is published and installed on the owner's
> machine; every merged package is in the shipped app. `grep '^status: Ready'
> docs/specs/*.md` returns nothing. The specs root holds three Drafts
> (`WP-dream-primary-dialogue-filter` — parked behind its evaluation;
> `WP-vault-write-cas-window` — backlog stub, unblocked, needs a design round;
> `WP-a10-windows-reap` — blocked on a Windows runner) and one Superseded stub
> (`WP-adr-0019-quarantine-uninstall-export`). Every previously pending ADR
> signature is signed. **Rules in force since today:** architect, implementers
> and all four project agents run on Opus at high effort (ADR-0005 Amendment 1);
> both review gates are unchanged (`wd-reviewer` on Opus; Codex plugin on
> `gpt-6-astra`, design and PR, recipe in pass #19 below and in
> `docs/runbooks/codex-review.md`).
>
> **DO FIRST — the filter's offline evaluation** (owner-ruled YES 2026-09-26,
> condition: the disposable vault lives only on the user's machine and is
> accessible to no one else). It is *not* an implementation and has no spec to
> dispatch; the procedure is the "Entry condition — the offline evaluation"
> section of `docs/specs/WP-dream-primary-dialogue-filter.md`, with the ruling
> block above it. Shape: (1) pick a small representative set of the owner's own
> sessions (decisions with rationale, corrections, an unresolved request,
> repetitive low-value dialogue, both harnesses); (2) project them with the
> shipped deterministic projection into a **disposable vault under the owner's
> home**, never the live vault, never the scheduled dream; (3) give an LLM judge,
> run through the owner's own subscription harness on that machine, the projected
> dialogue, the initial notes and the resulting memory diffs, and ask for
> important losses, unsupported claims, and material left in the input that is
> not worth remembering; (4) record judge model, input identities, verdict,
> human disposition and size/time observations in a dated
> `docs/specs/logbook/` entry — **never the transcripts or the projected notes**;
> (5) apply the spec's decision rule: not material → file the spec `Superseded`;
> material → the measured quantity becomes its justification and wd-architect
> matures it through the design gate. Owner items 1–2 of that spec stay as
> written.
>
> **DO SECOND — `WP-vault-write-cas-window` design round.** wd-architect (Opus,
> high) turns the stub's two candidate closures and its open questions into a
> real spec; then the Codex design gate to clean or accepted-residual; then
> `Ready`, dispatch-time re-verification, implementer on Opus-high, both PR
> gates. Nothing else in the queue is dispatchable work.
>
> **OWNER ITEMS STILL OPEN (none blocks the two above):** the standing items
> travelling with Done specs (gate package 2–3, scheduler package 1–3, deletion
> guards 4 — pass #20 item 7); the Windows runner purchase; the five backlog
> candidates of pass #20 (the `red-proofs`-in-CI gap is the one worth taking
> first); the two runbook lessons from today's release (`npm whoami` before
> publish; `npx wienerdog@latest sync` as the post-release update step).
>
> *The dated blocks below are the record of how today got here; pass #20 and
> #19 hold the gate recipe, the counts and the per-PR evidence.*
>
> **Ruling, 2026-09-26 — implementer and architect tier.** The owner ruled that
> architecture planning and coding both run on **Opus at high effort**; Sonnet is
> no longer dispatched for implementation (`wd-docs` and `wd-researcher` moved to
> Opus too, by the owner's follow-up the same day). Both review gates — `wd-reviewer` and
> the Codex adversarial gate on `gpt-6-astra` — are **unchanged**. Recorded as
> ADR-0005 Amendment 1 (OWNER-RULED 2026-09-26), `docs/specs/_TEMPLATE.md`
> (`model: opus`), `.claude/agents/wd-architect.md` (`effort: high`),
> `docs/specs/README.md` and the dispatch record in
> `docs/runbooks/codex-review.md`. Verbatim instruction:
> `docs/specs/logbook/2026-09-26-owner-ruling-opus-high-tier.md`.
>
> **Later the same day (second ruling, verbatim in
> `docs/specs/logbook/2026-09-26-owner-rulings-queue.md`):** the owner **signed
> the three ADR amendments** (0041, 0019, 0023 Am. 4 — his own Status-line
> edits, committed unchanged), answered the **filter's privacy question YES** on
> the condition that the disposable vault lives only on the user's machine and
> is accessible to no one else, and gave the **go to drive the queue**. Executed
> in the same PR: `WP-contract-reference-tables` filed **Done** (its
> implementation `609d96b0` had been on `main` since 2026-07-20 via integration
> merge `66585743`, never a PR — items 1 and 6 of the open-decisions list above
> are closed); `WP-ep2-retention-prune-timing-test` filed **Superseded** by its
> two Done successors (item 3 closed). Still open from that list: item 2 is now
> the evaluation itself, item 4 needs its design round, item 5 the Windows
> runner, item 7 unchanged.
>
> **0.15.0 RELEASED 2026-09-26.** #314 → #315 → #316 merged in order on the
> owner's instruction; `main` = `dfc03cd5`; tag `v0.15.0` on that commit;
> published by the owner from the tag (`+ wienerdog@0.15.0`, `latest` =
> 0.15.0); the published tarball's 123 files match `npm pack --dry-run` on the
> tag exactly; GitHub release created from the CHANGELOG section; CI on
> `dfc03cd5` green; local suite 3080 / 3068 / 0 / 12. The owner's install is on
> 0.15.0 (`~/.wienerdog/app/current → 0.15.0`, `doctor` clean apart from the
> standing oversize-transcript warning), so tonight's dream is the first to run
> the nine-package wave. **Two things learned, unspecced:** (a) the first
> `npm publish` failed with `E404` on PUT because the Sep-18 granular token had
> expired — `npm whoami` returned 401 — and `npm login` (browser flow) fixed it;
> the runbook's step 7 could say "check `npm whoami` first". (b) `wienerdog sync`
> run from the vendored shim re-vendors the copy it runs from (0.14.0 stayed
> 0.14.0); the update path is `npx wienerdog@latest sync`, which the runbook
> does not list as a post-release step. **Next: the filter's offline
> evaluation, then the cas-window design round.**
>
> **Status pass, 2026-09-22 #20 (the 2026-09-19 "go" ruling, executed end to end — all NINE Ready specs implemented, gated and merged; the backlog of Ready work is EMPTY.)**
> Measured on `main` at `032696f7`, not transcribed.
>
> **STATUS IN ONE PARAGRAPH.** The owner's go landed the whole queue. **Nine
> packages merged** (#303–#310, #312), **all seven `WD-SINK-*` defects are
> closed**, and `wienerdog uninstall` can no longer destroy the secret
> quarantine — neither through the disposer's sweeps nor through the manifest
> replay. Two done-flip PRs filed the records: **#311** (`d0982301`, eight
> specs, three canonical-extraction passes) and **this one** (the ninth spec,
> plus the X17 extraction). **`grep '^status: Ready' docs/specs/*.md` now
> returns nothing.** What remains on `main` is four Drafts and one In-Review
> with no PR — every one of them an owner decision, not work waiting to be
> dispatched.
>
> **THE OWNER'S OPEN DECISIONS — nothing moves without these.**
>
> 1. **Three ADR amendments await a signature.** Measured, all three reading
>    `Status: **ACCEPTED under standing authorization 2026-09-18 — owner
>    signature pending.**`: **ADR-0041** (`docs/adr/0041-…:336`, scheduler
>    replay), **ADR-0019** (`docs/adr/0019-…:88`, the uninstall carve-out) and
>    **ADR-0023 Amendment 4** (`docs/adr/0023-…:520`, `quarantined → deferred`).
>    Each was drafted inside its spec and arrived with the implementation.
>    **Nothing in this repository records the owner approving, accepting,
>    ratifying or signing any of them**, and the phrase to look for is exactly
>    *"owner signature pending"* — never anything else.
> 2. **The filter's privacy call** — `WP-dream-primary-dialogue-filter` is Draft
>    and parked, and its offline evaluation needs the owner to decide whether
>    **real transcripts may be projected into a disposable vault and judged**.
> 3. **Delete or keep `WP-ep2-retention-prune-timing-test`** (Draft). Genuinely
>    orphaned since #273 — nothing depends on it and its anchors are gone.
> 4. **`WP-vault-write-cas-window`** (Draft) — the backlog stub #297 left behind,
>    now unblocked: the deletion guards have landed.
> 5. **`WP-a10-windows-reap`** (Draft) — still blocked on a **Windows runner**,
>    which is a purchase, not a spec.
> 6. **`WP-contract-reference-tables`** — still **In-Review with no traceable
>    PR**, carried unresolved since pass #12.
> 7. **Standing owner items travelling with Done specs**, each reversible by
>    dated amendment and none a direct ruling: the gate package's **2 and 3**
>    (its item 1 shipped), the scheduler package's **1 and 3** (its item 2
>    shipped), and the deletion guards' **item 4** (refuse whenever any symlink
>    exists under `<core>` — recommended against, with its cost stated).
>
> **CLOSED since #19, so you can stop looking for it:** `docs/adr/README.md:51`
> no longer contradicts ADR-0043's own Status line. #311 made **two alignments
> to the owner's own signing commit `a8ea9dab`** — the README row now reads
> *"OWNER-SIGNED 2026-09-18"*, and ADR-0043's preamble no longer says nothing
> records the owner approving it, because `a8ea9dab` does.
>
> **THE NINE, IN MERGE ORDER.** Round counts and finding counts are read off the
> gate comments on each PR; merge SHAs re-derived with `git log`.
>
> | # | Spec | PR | Merge | Rounds | Independent-gate findings | What closed it |
> |---|------|----|-------|--------|---------------------------|----------------|
> | 1 | `WP-transcript-parsers-harden-text-values` | **#304** | `6eff5186` | 1 | 0 | Both gates clean on the first round. A non-string `text` value is now **declined**, not thrown on and not invented into dialogue. |
> | 2 | `WP-quarantine-only-copy-shelf` | **#305** | `06ccdb95` | 1 | 0 — fidelity states *"No band-A findings. No band-B findings against the implementation"* | Tests-only. Four declarations and their tests matched the frozen spec byte for byte; nine findings were all spec-side mirror drift, routed not fixed. |
> | 3 | `WP-secret-sink-redact-before-truncate` | **#303** | `42bd4836` | 2 | 1 `[P2]` at round 2 (round 1's comment is not on the PR, so its count is not measurable from the thread) | The `[P2]` read as a regression and was **not one**: four control cases across `main` and the tip showed a pre-existing scanner limitation (entropy dilution by same-alphabet padding) that the old cut position had masked. Recorded as **accepted residual 3**, not fixed. |
> | 4 | `WP-ledger-retry-parse-threw-on-upgrade` | **#307** | `c73676bf` | 1 | 0 | Traced that conversions and the one-shot marker share **one ledger object and one serializer**, so no state can persist a conversion without its marker and a crash before the write is idempotently re-converted. |
> | 5 | `WP-scheduler-replay-manifest-independent` | **#308** | `86f8669a` | 3 | **3 `[P1]` + 1 `[P2]`**; round 1's pair adjudicated *"Both HEAVY"*, round 2's fidelity finding 1 HEAVY and spec-side | Two ruling revisions: **R-B′** (each discovered path disclosed **exactly once**, by its owning record's own line — R-B had made `--dry-run` say `0 item(s) would be removed` while `--yes` removed one) and **R-C′** (act-time recheck asserts identity, `res.real === item.real`, instead of re-deriving containment). |
> | 6 | `WP-secret-stream-safe-cut-redactor` | **#306** | `1d8d4743` | 5 **+ 5b** | **2 `[P1]` + 5 `[P2]`**; rounds 1 and 2 each adjudicated HEAVY | Every per-push scan made **prefix-determined and region-bounded**, which killed the quadratic-cost family outright — plus an architect ruling giving Table B a **cost and memory envelope** so the last rounds had a criterion to check cost findings against instead of open-ended judgement. |
> | 7 | `WP-secret-sink-chunk-fix` | **#310** | `391db43f` | 1 **+ 1b** | 1 `[P2]`, adjudicated **"No product defect"** | The test was fixed, not the product: a bounded wait for the redacted marker before the teardown snapshot. The flush-and-latch contract was already proven by a **pre-fix control** that leaks at both sinks on `1d8d4743`. **This merge closed the last four `WD-SINK-CHUNK-*` defects.** |
> | 8 | `WP-adr-0019-quarantine-uninstall-gate` | **#309** | `8b4cbd4c` | 3 **+ 3b** | **9 `[P2]`** (3+3+3), one adjudicated HEAVY — a Y1 contract violation on the error path | **R-Y1** (an unreadable object is reported by its **shelf root**, never by its own path — the filename leak), **R-K/R-K′** (track the actual on-disk blocker paths so the printed remedy is correct), **R-W4-win32/R-QU7′** (host-specific remedy lines with every PowerShell quote delimiter escaped; RED fixtures made platform-independent). |
> | 9 | `WP-uninstall-shelf-deletion-guards` | **#312** | `032696f7` | **6 + 4b/5b/6b** | **14 `[P1]` + 8 `[P2]`** — 3+1, 2+2, 3+1, 1+2, 2+1, 3+1 | Round 3's **X17′** handed *"what does this path canonically resolve to"* to the kernel and **froze the resolver**, after five hand re-derivations each of which the next round falsified. Round 6's verdict was that its four items were **one recorded ruling not yet landed at four more sites**, so 6b applied them mechanically and no seventh round ran. |
>
> **The wave was interrupted and nothing was lost.** The last commit of 09-19 is
> `391db43f` at **06:54 CEST**; the next is `3cbb611c` at **2026-09-21 10:13
> CEST** — a weekly usage limit stopped the session with **#309 in flight on its
> branch**. It resumed on its own branch tip and merged. No work was redone and
> no gate verdict was carried across the gap.
>
> **COUNTS.** **24 numbered external PR-gate rounds** across the ten PRs of this
> wave (1 + 1 + 2 + 1 + 3 + 5 + 1 + 3 + 6 for the nine, plus **1** for the
> done-flip #311), **plus six LIGHT sub-rounds** (#306 5b, #309 3b, #310 1b,
> #312 4b/5b/6b). Every round ran on the Codex plugin with `gpt-6-astra`, in a
> detached worktree, raw committed before adjudication. That sits **on top of
> the 48 Astra design rounds of 2026-09-18** (`ls
> docs/specs/logbook/2026-09-18-*-astra-raw.json` = 48), so the nine packages
> carry **72 external review rounds between design and merge**. Independent-gate
> findings this wave: **at least 19 `[P1]` and 25 `[P2]`** — a floor, because
> #303's round-1 comment is not on the PR.
>
> **OWNER BACKLOG CANDIDATES from this wave — recorded, never decided.** Nothing
> here records the owner approving, accepting or scheduling any of them.
> (1) **A canonical-extraction pass over X17** — **DONE in this PR**: Table R,
> sixteen rows, with X17 shrunk to a pointer and every site registered as a
> mirror. (2) **A generator-based fuzz that produces aliases INTO the quarantine
> and copies arriving after the gate** — the deletion-guard family was found one
> shape per round for eight rounds, because each round's fuzz generated only
> what the previous round had imagined. (3) **`npm run red-proofs` is in no CI
> workflow** — measured: `.github/workflows/` holds `ci.yml`,
> `install-smoke.yml`, `scenarios.yml`, and `grep -rn red-proofs` over them
> returns nothing, so every RED verdict this repository has ever recorded is a
> local run. (4) **A scanner-side windowed-entropy rule**, from #303's accepted
> residual 3. (5) **A Table B authoring rule — predict per-test or say "at
> least"**: five of #312's twenty designed `expectRed` cells predicted an extent
> and every one was wrong low (one said two and measured **29**).
>
> **PROCESS FINDINGS FOR THE RUNBOOK — all seven unspecced.**
> (a) **A gate that passes round 5 without closing must trigger a mandatory
> "freeze or split" decision.** Recommended in pass #19 off two design gates;
> **this wave applied it three times and it worked every time** — #306's round-5
> freeze, #312's round-3 resolver freeze and its round-6 surface freeze.
> (b) **A spec that ships a "bounded work" claim ships its per-byte ceiling and
> its chunk envelope with it** — three of #306's five rounds went on a resource
> dimension the contract never stated.
> (c) **"Refuse" is not fail-closed when the fallback is a forced cut.** Name
> what happens next and check that *it* is safe.
> (d) **A ruling that changes a disclosure surface must be checked against the
> FATE of every case class before it is written** (#308's R-B: consent obtained
> for less than was done).
> (e) **An independent-gate "regression" claim needs control cases on BOTH trees
> before it is classed HEAVY** (#303: real, and one quarter the size the report
> implied).
> (f) **An implementer's measured performance attribution must be reproduced by
> the reviewer before it is believed** (#306: the bound a comment justified made
> plain blank lines 220× slower).
> (g) **The dispatch template must name the branch from the spec's own
> Definition of done**, not from a short slug — #303 and #305 both landed on
> branches their specs did not name.
>
> **MERGED TREE.** `npm run lint` **re-run on this branch this pass — passed**.
> `npm test` and red-proofs were **not** re-run here and no new counts are
> claimed: `git diff --stat 624b82f8 032696f7 -- src tests` is **empty**, so the
> implementer's measurement on the merged tip stands — **tests 3080 / pass 3068
> / fail 0 / skipped 12** on darwin and **3080 / 3057 / 0 / 23** on ubuntu, with
> all 47 `[SG-*]` tests running there. Unfiltered `npm run red-proofs` on that
> tip: **`RUN: PROVEN`, 179/179**, zero `FAILED`/`VACUOUS`/`UNCONTROLLED`/
> `FILTERED`/`ERROR` — and 179 is re-derived this pass as the declaration count
> across the 35 files in `tests/red-proofs/`. CI on `624b82f8`: seven checks
> pass.
>
> **NO NPM RELEASE HAS BEEN CUT.** The nine packages of this wave — including
> every `WD-SINK-*` fix and the whole uninstall carve-out — are on `main` and
> **not on the installed app**, so tonight's dream carries none of them.
>
> **Next in the queue:** (1) the **three signatures**; (2) the **filter's
> privacy call**; (3) an **npm release** carrying this wave; (4) the four Draft
> decisions and `WP-contract-reference-tables`; (5) the five owner backlog
> candidates above.
>
> **Status pass, 2026-09-18/19 #19 (same session, evening–night — wave 2 of the owner's "mature them" ruling: four Draft stubs went through design gates, two reached Ready, one was superseded, one split in two. Every design round ran on the Codex plugin with `gpt-6-astra`; every raw was committed before adjudication.)**
> Measured on `main` at `b3d13dda`, not transcribed.
>
> **Both ADR signatures the owner owed have landed.** **#296** (`18752fd9`) set the Status lines of **ADR-0025 Amendment 6** (`docs/adr/0025-hermetic-runtime-profiles.md:484`) and **ADR-0043** (`docs/adr/0043-safe-cut-stream-redaction.md:3`) to *"owner-signed 2026-09-18"*. **Owner-signed ADR amendment Status lines on `main` now number four:** ADR-0012 part 6 (`:446`), ADR-0020 (`:402`), ADR-0025 Am. 6 (`:484`), ADR-0043 (`:3`). **Drift found while measuring, not fixed:** the index row for 0043 in `docs/adr/README.md:51` still reads *"owner signature pending"* and now contradicts the ADR's own Status line. One-line docs fix; **unspecced**.
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-quarantine-only-copy-shelf` (S) | **Ready** | **#295** (`2b1e35d3`, head `5a19fda7`) | Design gate closed at **round 4** (4 Astra rounds). The universal only-copy premise became a **partition into four shelf classes**; the prune performs **no identity check**; **candidate (a) stands** — the decision survived the rewrite, the documentation did not. No `src/` change. Dispositions: `docs/specs/logbook/2026-09-18-quarantine-only-copy-shelf-design-review.md`. |
> | 2 | `WP-ep2-atomic-withhold-handoff` | **Superseded** | **#297** (`37682ff0`, head `21b20943`) | The premise expired: **the withhold arm no longer reads-then-destroys** since the workspace rehoming. The genuine residue was filed as a new Draft, `WP-vault-write-cas-window`. Basis: `docs/specs/logbook/2026-09-18-ep2-atomic-withhold-handoff-superseded.md`. |
> | 3 | `WP-scheduler-replay-manifest-independent` (M) | **Ready** | **#298** (`5b77865f`, head `5a050f89`) | **TEN Astra rounds**; measured band/weight over the dispositions: **12 band-A HEAVY**, 2 band-A LIGHT, 1 band-B LIGHT. What closed it: the **coverage predicate was deleted** rather than patched; **discovery roots bounded to the run's own home/core** — the XDG escape by which `npm test` could have unloaded a *real* systemd timer; **one resolution rule (D15) with one abort site**; a **filesystem-free unload phase**; and one named residual, `R-preserved-reloadable-plist`. Owner items: unload-only vs unload-and-remove; the ADR-0041 amendment narrowed to *"closed except…"*; the retryable-refusal alternative. Dispositions: `docs/specs/logbook/2026-09-18-scheduler-replay-manifest-independent-design-review.md`. |
> | 4 | `WP-adr-0019-quarantine-uninstall-export` | **Superseded by a split** | **#299** (`b3d13dda`, head `8485ae0a`) | **TWENTY-TWO Astra rounds** — the longest gate this repository has run. Measured: **23 HEAVY findings (16 band-A, 7 band-B)**. It closed by splitting. Dispositions: `docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`. |
> | 4a | `WP-adr-0019-quarantine-uninstall-gate` (M) | **Ready** | **#299** | Inventory + pre-plan **REFUSE-AND-REPORT**: `uninstall` **refuses while a shelf holds unredacted originals**, prints the count and the literal `rm -rf`, **writes no copy**, and **`--yes` does not override**. Ships an ADR-0019 amendment that will read *"owner signature pending"*. Owner items 1–3. |
> | 4b | `WP-uninstall-shelf-deletion-guards` (M) | **Ready**, `depends_on: [WP-adr-0019-quarantine-uninstall-gate]` | **#299** | **Tables X/V**: every mutating operation of `uninstall` enumerated under **one containment rule X16** and **one resolution rule X17**; the disposer's **bottom-up `rmdir` sweep**; the replay guard; **three named residuals**. Owner item 4. |
>
> Read each spec's **Definition of done** for its own round count and raw SHAs; the dispositions logbooks above are the per-finding record.
>
> **Backlog: NINE `Ready` specs, none dispatched — every one held for the owner's go.** (The measurement is `grep '^status: Ready' docs/specs/*.md`.) Dispatch order and dependencies:
>
> | Order | Chain | Blocked on the owner's ruling first? |
> |---|---|---|
> | 1 | `WP-transcript-parsers-harden-text-values` (M) **→** `WP-ledger-retry-parse-threw-on-upgrade` (M) | **Yes** — release ordering, and an **ADR-0023 amendment** for the `quarantined → deferred` transition. Field fact: 0.14.0 strands every `parse-threw` quarantine until the retry lands. |
> | 2 | `WP-secret-sink-redact-before-truncate` (S) **∥** `WP-secret-stream-safe-cut-redactor` (M) **→** `WP-secret-sink-chunk-fix` (M) | The three `WD-SINK` packages. The S and the redactor are independent and may run in parallel; the chunk fix `depends_on` **both**. **ADR-0043 is now owner-signed**, so the signature that blocked this chain is cleared; three owner items remain. |
> | 3 | `WP-quarantine-only-copy-shelf` (S) | No open owner item. It is also a `depends_on` of order 4's gate, so it goes first. |
> | 4 | `WP-scheduler-replay-manifest-independent` (M) **→** (composes with) `WP-adr-0019-quarantine-uninstall-gate` (M) **→** `WP-uninstall-shelf-deletion-guards` (M) | **Yes** — the scheduler package's three owner items and the gate's owner items 1–3 before dispatch; the deletion guards' owner item 4 before theirs. |
>
> **Drafts.** `WP-dream-primary-dialogue-filter` — **parked**; its offline evaluation needs the owner to decide **whether real transcripts may be projected into a disposable vault and judged**. `WP-vault-write-cas-window` — new backlog stub from #297. `WP-ep2-retention-prune-timing-test` — **orphaned**; deleting it is the owner's call. `WP-a10-windows-reap` — still blocked on a **Windows runner**. `WP-contract-reference-tables` is still **In-Review with no traceable PR**.
>
> **OWED BY THE OWNER.** (1) The **two "go" decisions** carried from #18, now widened to the go on all nine Ready specs. (2) The **wave-2 owner items** — scheduler's three, the gate's 1–3, the deletion guards' 4. (3) The **Cursor/Windsurf Table B call** from #277. (4) The **filter's privacy call** (real transcripts into a disposable vault). (5) **Two signatures that are not yet on `main` at all**: the **ADR-0041 amendment** and the **ADR-0019 amendment**. Measured: `docs/adr/0041-real-scheduler-mutation-is-opt-in.md:3` and `docs/adr/0019-uninstall-disposes-core-mechanics.md:3` both read plain `Status: Accepted` — **each amendment is drafted inside its Ready spec and arrives with the implementation**, carrying *"owner signature pending"*. Nothing in this repository records the owner approving, accepting, ratifying or signing items (1)–(5); the only owner signatures recorded are the four Status lines named at the top of this pass.
>
> **Process, measured this pass.** Counting raw reviewer outputs on disk (`ls docs/specs/logbook/2026-09-18-*-astra-raw.json`): **48 Astra design rounds today across EIGHT spec families** — 22 (adr-0019), 10 (scheduler-replay), 4 (only-copy shelf), 3 each (parse-threw successors, secret-sink fix, broker-e2e cleanup), 2 (ep2 successors), 1 (dream-collect quarantine). The two long gates (10 and 22) converged only once the runbook's **freezing rule** was applied, in four moves that are worth reusing verbatim: **delete the predicate rather than patch it**; **state one resolution rule rather than one per site**; **bound a finding family with a named residual plus a threat-model row**; and the architect's **whole-cell re-read after every rewrite**, which caught **four intra-cell drifts that no reviewer had reported**. Recommendation, **unspecced**: a runbook addition making a gate that passes **round 5** without closing trigger a mandatory **"freeze or split"** decision — both long gates ended in exactly one of those two moves.
>
> **Merged tree.** `npm run lint` **re-run on this branch at `b3d13dda` this pass — passed**. `npm test` and red-proofs were **deliberately not re-run**, and no new counts are claimed: the code tree is byte-identical to #18's measurement point — `git diff --stat 85029a8e..b3d13dda -- src tests` is **empty** — so #18's figures stand unchanged (tests **2907 / pass 2895 / fail 0 / skipped 12**). Every commit since `85029a8e` is docs-only.
>
> **Next in the queue:** (1) the **owner's go on the nine Ready specs**, in the four-chain order above — nothing else moves; (2) the **filter's privacy call**; (3) the **NUL/binary lint guard** (unspecced, carried from #18); (4) the **ADR README 0043 row** (one line, unspecced); (5) `WP-vault-write-cas-window` once the deletion guards land.
>
> **Status pass, 2026-09-18 #18 (same session, afternoon — v0.14.0 is released and installed; four packages land and are filed Done; two design families reach Ready and stop, waiting on the owner).**
> Measured on `main` at `85029a8e`, not transcribed.
>
> **v0.14.0 IS RELEASED (2026-09-18).** On npm as `latest`, a GitHub release, tag `v0.14.0` on commit `1f546baa`. **The installed app was upgraded with `wienerdog update` and `doctor` is green**, so the nightly dream now runs the **seven implementations merged since #245** — before this, `main` had them and the machine did not. The ADR-0012 part-6 and ADR-0020 amendment status lines on `main` now read *"owner-signed 2026-09-18"*, landed by **#275**. Release step 2's instruction-filename re-inventory ran as **#277**: the denied set is unchanged; **the Cursor/Windsurf drift is open and is a Table B call for the owner.**
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-doctor-recognizes-parse-threw` | **Done** | implementation **#288** (`cc1d63be`, tip `1e0d4c9e`), filed by **this PR** | `doctor` names the `parse-threw` skip instead of calling it unrecognized. **One gate round, both clean, NO errata** — the fidelity gate recorded *"No drift; no errata for the done-flip."* Three non-blocking reviewer observations are recorded in the spec as **"Reviewer notes, non-errata"**. Unfiltered red-proofs on the tip: `RUN: PROVEN`, 104/104. |
> | 2 | `WP-ep2-n2-rehome` | **Done** | implementation **#285** (`862f8277`, tip `0b3d768c`), filed by **this PR** with **erratum 3** | Table N row N2 and M-48 re-homed onto the prune locus that exists. **Two gate rounds**; round 1 found a family stale on the SPEC's side, fixed by errata 1 and 2 (**#287**, **#290**). Docs-only: no test, no executable line, **so no red-proofs verdict applies and none is claimed.** |
> | 3 | `WP-ep2-prune-once-per-run-test` | **Done** | implementation **#293** (`85029a8e`, tip `4309405c`), filed by **this PR** with **four errata** | **N2 finally has a detector.** One test, two RED declarations; unfiltered red-proofs `RUN: PROVEN`, 106/106. **M-48's AC-15 census limb moved `gap` → `executed`** in the ep2 Done spec, which is the routed documentation pass — and it needed a **second** surface, because that census's `executed` limb compares its verdict target against the paired mutation row. |
> | 4 | `WP-broker-e2e-terminal-cleanup` | **Done** | implementation **#284** (`ee98cbd9`, tip `244da798`), filed by **this PR** with **erratum 5** | LP2's AUTH-BLOCKED residue is gone and `weekly-review`'s floor is real. **Three gate rounds, FOUR prior spec errata (#286, #289, #291, #292), ZERO implementer defects** — every finding was against spec prose. **Live V-1: all three routines `CONTAINED` from a plain terminal.** |
> | 5 | `WP-transcript-parsers-harden-text-values` (M) → `WP-ledger-retry-parse-threw-on-upgrade` (M) | **Ready**, design gate closed round 3 | — | **HELD FOR THE OWNER'S GO.** Owner items: the release ordering, and an **ADR-0023 amendment for the `quarantined → deferred` transition**. Field fact that makes this urgent: **0.14.0 strands every `parse-threw` quarantine** until the retry lands. |
> | 6 | `WP-secret-sink-redact-before-truncate` (S) ∥ `WP-secret-stream-safe-cut-redactor` (M) → `WP-secret-sink-chunk-fix` (M), plus **ADR-0043** | **Ready**, design gate closed round 3 | — | **HELD FOR THE OWNER'S GO.** **Dispatch order:** the S and the redactor are independent and may run in parallel; the chunk fix depends on **both** and goes last. Three owner items; **ADR-0043's status line reads "owner signature pending."** |
> | 7 | `WP-ep2-retention-prune-timing-test` | **superseded** | parked by **#273** | Row 3 above did what this spec was for. It is now **genuinely orphaned** — nothing depends on it and its anchors are gone. **Deleting it is the owner's call.** |
> | 8 | Not started | — | — | The **three M stubs** (`WP-adr-0019-quarantine-uninstall-export`, `WP-ep2-atomic-withhold-handoff`, `WP-scheduler-replay-manifest-independent`); `WP-quarantine-only-copy-shelf` (S); the **filter's offline-evaluation design** that decides `WP-dream-primary-dialogue-filter`; `WP-a10-windows-reap`, still blocked on a **Windows runner**. |
>
> **OWED BY THE OWNER — four items, nothing moves without them.** (1) The signature line on **ADR-0025 Amendment 6**; (2) the signature line on **ADR-0043** — both on `main` reading *"owner signature pending"*. (3) The **Cursor/Windsurf Table B call** from #277. (4) The **two "go" decisions**, rows 5 and 6. Nothing in this repository records the owner approving, accepting, ratifying or signing items (1)–(4); items taken under the standing process are recorded as such and are reversible by dated amendment.
>
> **Process, measured this pass.** **Four families went through design gates today; 11 Astra rounds.** Every HEAVY finding came from Astra **executing** the design rather than reading it — the last-line cut predicate, the shutdown scope, retry-by-deletion, fixture cardinality, consumption evidence, and the DST duplicate. **The implementation gates found ZERO code defects and SEVEN spec-mirror defects**, which is now the settled shape: the specs, not the diffs, are where the errors are. Two tooling notes worth carrying: under **`ugrep`**, `${missing.length}` in the V-4 pattern parses as an interval quantifier and the pattern silently fails to match (`/usr/bin/grep` is fine) — the check was right, the tool was the variable; and **a NUL byte passed `npm run lint`**, so a NUL/binary guard in the lint pipeline is worth adding. **That guard is unspecced.**
>
> **Merged tree** (run on `main` at `85029a8e` this pass, not transcribed): `npm test` **2907 / pass 2895 / fail 0 / skipped 12**; `npm run lint` **passed**. Red-proofs was **not** re-run here; the verdicts are the two implementers' own unfiltered logs — on `1e0d4c9e` `RUN: PROVEN`, **104 declared / 104 selected / 104 PROVEN**, and on `4309405c` `RUN: PROVEN`, **106 declared / 106 selected / 106 PROVEN**, both with zero `FAILED`/`VACUOUS`/`UNCONTROLLED`/`FILTERED`/`ERROR`.
>
> **Next in the queue:** (1) the **two held "go" decisions**, rows 5 and 6 — everything else is behind them; (2) the **filter's offline evaluation design**; (3) the stubs; (4) a **NUL/binary guard in lint**.
>
> **Status pass, 2026-09-18 #17 (same session, morning — the dream lane of the 2026-09-17 order is complete; one backlog package found stale and parked).**
> Measured on `main` at `37d199fd`, not transcribed. The delta since #16 is **docs-only** (`git diff --stat 900dd6d4..37d199fd -- src tests skills scripts bin templates` is empty), so #16's merged-tree figures stand.
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-ep2-retention-prune-timing-test` | Draft, **STALE — do not dispatch** | parked by **#273** | Assessed at `622ca04b`: the `scanTokens` loop it anchors to is gone (`WP-dream-promote-in-workspace`), the `git diff --cached` seam it observes is gone (`WP-dream-gate-inputs-baseline-delta`), and the only test file its Deliverables permit can assert only the fixture's own `pruneRedacted` call — production's is `src/cli/dream.js:1102`. **The gap is real**: nothing in `tests/` asserts the prune runs once per run. Assessment: `docs/specs/logbook/2026-09-18-ep2-retention-prune-timing-test-stale.md`. |
> | 2 | `WP-ep2-n2-rehome` | **Draft** (new, S, docs-only) | **#273** | Re-homes Table N row N2 / B10 / B12 and M-48 of the ep2 Done spec to the real locus. **No design round; not dispatchable.** |
> | 3 | `WP-ep2-prune-once-per-run-test` | **Draft** (new, S, depends on 2) | **#273** | One pipeline-suite test + one ADR-0042 declaration. Open design question recorded: `src/cli/dream.js:33-38` destructures `makeGates` at require time, so a module mock cannot reach the binding. **No design round; not dispatchable.** |
>
> **Everything that remains needs the owner:** the two signature lines (ADR-0012 part 6, ADR-0020); whether to mature the two ep2 successors and the four Draft stubs; the offline evaluation design that decides `WP-dream-primary-dialogue-filter`; a spec for the `WD-SINK-*` fix (owner item O2 of `WP-secret-sink-wiring-probes`); the `doctor` arm for `parse-threw` and the parser-hardening successor; `WP-broker-e2e-terminal-auth` (interactive terminal auth); **and an npm release** — the installed app is still 0.13.0 and carries none of the seven implementations merged since #245. Nothing in this repository records the owner approving, accepting, ratifying or signing any of the items taken under standing authorization.
>
> **Status pass, 2026-09-18 #16 (same session, overnight — the crafted-transcript DoS is closed on `main`; both gates clean in one round on the Codex plugin with `gpt-6-astra`).**
> Measured on `main` at `900dd6d4`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-dream-collect-parse-throw-quarantine` | **Done** | implementation **#271** (`900dd6d4`, tip `cac39c0f`), filed by **this PR** with seven errata | A transcript whose preparation throws is now **set aside** with reason `parse-threw` and the run continues; it is named in `reports/warnings.md` under *"Something in the session file stopped Wienerdog from reading it"*. `sanitize` is bounded to 128 characters, which is what makes `writeFilePrivate` failures environmental again. **The parsers are still unhardened** — that is the successor. |
> | 2 | `WP-dream-primary-dialogue-collection` | **Done** | implementation **#269** (`297ef1df`), filed **#270** with nine errata; **erratum 10 added by this PR** | Erratum 10: every cite placing `sanitize` at `scratch.js:18-20` is stale (now `:28-30`, with a width bound). Cites are **not** rewritten — a Done spec records what was true at its pin. |
> | 3 | `WP-dream-primary-dialogue-filter` | Draft, **parked** | — | Unchanged entry condition: an offline evaluation of #2 + the projection must call for it. |
>
> **Owner: still owed the two signature lines** — the ADR-0012 part-6 amendment and the ADR-0020 amendment, both on `main` reading "owner signature pending". Nothing in this repository records the owner approving, accepting, ratifying or signing either. **And, plainly: owner item 3 of `WP-dream-collect-parse-throw-quarantine` was NOT adopted.** Its preamble says every item is adopted under standing authorization, but the Deliverables table, Table A row A7 and Out of scope all decline `src/cli/doctor.js`, and `scripts/boundary-check.js` reads the **table**. The tables bind.
>
> **New since #15, routed and not fixed:** (a) **`wienerdog doctor` renders a `parse-threw` count as an unrecognized reason** — `src/cli/doctor.js:515-521` has arms for `over-ceiling`/`too-many-lines`/`read-error` only, so `:565` says *"skipped for a reason this version does not recognize"* about a reason this version emits. Truthful count, wrong about recognition. Successor is one `switch` arm plus one assertion; **unspecced**. (b) The `--wp`-scoped `npm run red-proofs` that can never exit 0 **still sits in the parked filter spec** as a gating check. (c) **Deliverables Notes cells that predict an extent keep going stale** — an append point, "one array literal", Table C's Criterion column, three times in one package. The reviewer recommends marking extent-predicting cells as **non-binding hints that defer to the acceptance criteria**, as `expectRed` already does. Runbook change, **unspecced**. Carried from #15: the seven `WD-SINK-*` defects; the scratch-filename collision.
>
> **Merged tree** (`main` at `900dd6d4`): `npm run lint` **re-run this pass — passed**. `npm test` was started on `900dd6d4` and **had not finished when this pass was written** — this machine was saturated (`tests/integration/adopt-e2e.test.js` alone took ~40 min), so the counts here are **not** a fresh local measurement. Their basis: `900dd6d4`'s tree is **byte-identical** to tip `cac39c0f` (`git diff cac39c0f 900dd6d4` is empty), where CI's `test (ubuntu-latest)` and `test (macos-latest)` both pass and the implementer measured tests 2904 / pass 2892 / fail 0 / skipped 12. Red-proofs was **not** re-run either — the verdict is the implementer's unfiltered log on `cac39c0f`: `RUN: PROVEN`, **165 PROVEN**, zero `FAILED`/`VACUOUS`/`UNCONTROLLED`/`FILTERED`/`ERROR`. Worth knowing: the implementer's **first** unfiltered run was `RUN: ERROR`, on a *sibling* package's proof, because this spec's own hoist note re-spelled the substring that proof pins (erratum 5).
>
> **No npm release has been cut.** The installed app is still **0.13.0**, so tonight's dream carries **none** of this session's fixes — the crafted-transcript DoS is closed on `main` only — until a release is cut and installed.
>
> **Next in the queue:** (1) the offline evaluation that decides `WP-dream-primary-dialogue-filter`; (2) spec a fix for the `WD-SINK-*` defects; (3) the parser-hardening successor **plus** the `doctor` arm; (4) `WP-ep2-retention-prune-timing-test`; `WP-broker-e2e-terminal-auth` needs an interactive terminal-auth spike and is left for the owner; then the stubs; `WP-a10-windows-reap` stays blocked on a Windows runner. `WP-contract-reference-tables` is still `In-Review` with its implementing commit on `main` and no traceable PR.
>
> **Status pass, 2026-09-18 #15 (same session, overnight — the primary-dialogue epic's second package landed; every review on the Codex plugin with `gpt-6-astra`).**
> Measured on `main` at `297ef1df`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-dream-primary-dialogue-collection` | **Done** | implementation **#269** (`297ef1df`, tip `119137d2`), filed by **this PR** with nine errata | The collector now writes PRIMARY DIALOGUE and routes a text-free gate projection to the ledger gate in memory. **Measured (AC7): the same 81 sessions reach the model as 3.2 % of the previous scratch volume.** Byte-policy equivalence holds; admitted-set identity does not — see the owner item below. Both gates clean on `119137d2`. |
> | 2 | `WP-dream-primary-dialogue-projection` | **Done** | implementation **#266** (`b46a3843`), filed #267 with six errata | `parsePrimaryWithOutcome` in the transcript parsers. Now consumed by #1. |
> | 3 | `WP-dream-collect-parse-throw-quarantine` | **Ready** | spec **#268**, **re-pinned by this PR to `297ef1df`** | A per-candidate fault boundary so one crafted transcript stops ending every nightly run. **Dispatchable now** — its dependency was merge order, not contract, and #1 has merged. The re-pin is a cite refresh: no contract row's rule changed (`docs/specs/logbook/2026-09-18-dream-collect-parse-throw-quarantine-repin.md`). |
> | 4 | `WP-dream-primary-dialogue-filter` | Draft, **parked** | — | The model relevance stage. Entry condition unchanged: an offline evaluation of #1 + #2's output must call for it. |
>
> **Owner items** — collection items 1/3 stand (byte-policy equivalence, **not** admitted-set identity: on a deadline-bound install the admitted set can move in either direction, and every admitted session is marked processed read or not — measured this pass at 6 fewer admitted under projection in the deadline regime, −12 %, with **no byte verdict moved**). **Still owed by the owner: two signature lines.** The ADR-0012 part-6 amendment on `main`, and now the **ADR-0020** amendment, which #269 landed on `main` reading *"ACCEPTED under standing authorization 2026-09-17 — owner signature pending."* Nothing in the repository records the owner approving, accepting, ratifying or signing either.
>
> **Routed, not fixed, carried forward:** the seven `WD-SINK-*` defects; the scratch-filename collision (`s_1` / `s.1` → one file) still silently loses one session's dialogue while marking both processed — #269 only stopped the authorization gate weakening over it; a `--wp`-scoped `npm run red-proofs` can never exit 0 (`RUN: FILTERED` by construction) and one more `Ready`/Draft spec still lists it as a gating check (see this PR's Discovered issues). **Nine spec-side errata this package** — all prose a measured value falsified (a byte count, two `expectRed` sets, which cases redden), plus one acceptance criterion whose two clauses could not both hold.
>
> **Merged tree** (run on `297ef1df` this pass): tests 2895 / pass 2883 / fail 0 / skipped 12; lint passed. Red-proofs was **not** re-run here — the verdict is taken from the implementer's unfiltered run log on tip `119137d2`: `RUN: PROVEN`, **157 PROVEN**, zero `FAILED`/`VACUOUS`/`UNCONTROLLED`/`FILTERED`/`ERROR`. **No npm release has been cut.**
>
> **Next in the queue:** (1) implement `WP-dream-collect-parse-throw-quarantine` (Ready, S, dispatchable); (2) the offline evaluation that decides the filter; (3) spec a fix for the `WD-SINK-*` defects; (4) `WP-ep2-retention-prune-timing-test`; `WP-broker-e2e-terminal-auth` needs an interactive terminal-auth spike and is left for the owner; then the stubs; `WP-a10-windows-reap` stays blocked on a Windows runner. `WP-contract-reference-tables` is still `In-Review` with its implementing commit on `main` and no traceable PR.
>
> **Status pass, 2026-09-17 #14 (same session, late — owner-authorized merges; every review on the Codex plugin with `gpt-6-astra`).**
> Measured on `main` at `811f7abc`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-dream-digest-omits-own-job-alerts` | **Done** | implementation **#257** (`a47f2546`), filed #260 with two errata | The 2026-09-10 banner bug. Shipped design: the end-of-run render stays unfiltered and byte-identical to before; ONE filtered render is the last statement of the locked body; a record is omitted only if `findJob` resolves `WIENERDOG_JOB` to `run: builtin:dream`, a valid run token is present, and the record's `at` predates this process's start; no recovery mechanism. **Named consequence:** the managed-policy hook warning (`run-job` ~l.953), appended before the spawn, is now omitted by that render — its only lasting surface — deferred by the 2026-09-10 maintainer ruling. |
> | 2 | `WP-secret-sink-wiring-probes` | **Done** (tests-only, diagnostic) | implementation **#261** (`c94e0e66`), filed #263 | Sixteen probes over nine `redactOnly` call sites (the draft listed eight). **Seven pin KNOWN DEFECTS, all OPEN, no fix specced:** three truncation leaks (a value straddling the 2000-char field cap leaves a 24-char head in `alerts.jsonl` / `run-evidence.jsonl`) and four chunk-boundary leaks. **The chunk residual the owner approved on 2026-07-17 is worse than its wording:** a secret split across two stream chunks is redacted by neither per-chunk call and lands **WHOLE and contiguous** in `logs/dream/<date>.log` and `logs/<job>/<date>.log`; the comments at `src/core/dream/brain.js:504-508` and `src/cli/run-job.js:1048-1052` say "may be only partially redacted". Same-user exposure (0600/0700). Measured by the architect, verified in the code by the orchestrator, reproduced by the design reviewer through real subprocess pipes. **A green suite does not mean the sinks are safe.** |
> | 3 | `WP-dream-report-run-skips` | **Done** | implementation **#264** (`811f7abc`) | The dream report now states six integer counts for sessions a run could not consolidate, including the oversized arm that had no durable surface. Wording is byte-exact and every sentence was checked by executing the collector; two promises were removed as false ("for the first time"; "will be retried"). Renders only on a run that admitted at least one session and reached `promote()`. |
> | 4 | `WP-dream-primary-dialogue-projection` | **Ready** (new, M) | spec **#262** | Deterministic, code-only `parsePrimaryWithOutcome` in the transcript parsers. Five design rounds; the provenance rule leaked one boundary per round until it was rewritten as one ordered decision procedure and checked against an executable transcription (`docs/specs/logbook/2026-09-17-dream-primary-dialogue-taint-model.js`, 0 mismatches / 35), which found two cases no reviewer had. **Implementation in progress** on `wp/dream-primary-dialogue-projection`. |
> | 5 | `WP-dream-primary-dialogue-collection` | **Ready** (new, M) | spec **#262** | Wires the projection into the collector; admission against X stays on the RAW capped extract, so byte policy is unchanged. **Not dispatchable yet:** needs #4 merged, **and its cites into `scratch.js`, `promote.js`, `dream.js` and `dream-collect.test.js` re-derived by wd-architect — #264 changed all four.** Carries the dated ADR-0020 amendment. |
> | 6 | `WP-dream-primary-dialogue-filter` | Draft, **parked** | revised in #262 | The model relevance stage. Its offline LLM-judge evaluation is now its ENTRY condition: matured only if an evaluation of #4 + #5's output calls for it. |
>
> **Owner items taken under standing authorization since pass #13 — each reversible by dated amendment, none a direct ruling** (`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`). Look first at: **secret-sink O2** (is the whole-credential chunk leak still inside what was approved on 2026-07-17? recommendation adopted: approved but mis-described); **projection item 3** (user text is `false` by role even when it quotes tool output — today's rule; and `false` claims only harness attribution, never that a human typed it) and **item 6** (an unlisted content-block type taints the rest of the session, with no diagnostic); **collection items 1/3** (byte-policy equivalence, not admitted-set identity — on a deadline-bound install more sessions can be admitted and marked processed unread). **Still owed by the owner:** the signature line on the ADR-0012 part-6 amendment (on `main`); the ADR-0020 amendment arrives with #5's implementation reading "owner signature pending".
>
> **New since pass #13, routed and not fixed:** the seven `WD-SINK-*` defects above (the first thing to spec next, in the orchestrator's view); the two stale comments describing the chunk residual; a scratch-filename collision (`s_1` / `s.1` → one file) silently overwrites one session's dialogue with another's — pre-existing; an unfamiliar Codex `payload.type` or an unlisted block type will taint whole sessions with no diagnostic once #4 lands.
>
> **Process, measured this session:** ten design rounds on `gpt-5.6-sol` closed or approved three specs; confirming rounds on `gpt-6-astra` re-opened all three, each by EXECUTING production function bodies with mocked I/O. Thereafter every design round and every PR gate ran on the Codex plugin with `--model gpt-6-astra`. Both gates ran on the same tip for all five implementation PRs; the plugin's native `review` cannot execute filesystem-writing tests in its sandbox and says so each time, so the executed evidence on a PR is wd-reviewer and CI. Three spec families lost round-N corrections in their prose mirrors; a mechanical phrase sweep, re-run by the orchestrator, is what stopped it. Unfiltered `npm run red-proofs` now takes 15–20 minutes (86 declarations): redirect its whole output to a file, read the verdict, wait on its own PID.
>
> **Merged tree:** tests 2813 / pass 2801 / fail 0 / skipped 12; lint passed; red-proofs `RUN: PROVEN`, 86 declared. **No npm release has been cut.**
>
> **Next in the queue:** (1) land #4 (both PR gates on the same tip); (2) wd-architect re-pins #5, then implement it; (3) the offline evaluation that decides #6; (4) spec a fix for the `WD-SINK-*` defects; (5) `WP-ep2-retention-prune-timing-test`; `WP-broker-e2e-terminal-auth` needs an interactive terminal-auth spike and is left for the owner; the four stubs; `WP-a10-windows-reap` stays blocked on a Windows runner. `WP-contract-reference-tables` is still `In-Review` with its implementing commit on `main` and no traceable PR.
>
> **Status pass, 2026-09-17 #13 (same day session, continued — owner-authorized merges; the review backend changed mid-session).**
> Measured on `main` at `242c37b8`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 1 | `WP-dream-lock-stale-owner-loud` | **Done** (new, S) | spec #251, implementation **#253** (`242c37b8`) | **The release blocker for #245's lock is closed.** A `busy` decline more than 6 h past the lock's deadline now throws (exit 1 → alert/email); a deadline more than an absolute 24 h ahead is refused as `owner-unknown`; **no takeover decision changed**. Seven design rounds. Dropped on evidence: a "proven dead by reboot" takeover, and every form of a deletion instruction in the message. No wall-clock maximum is claimed for the silence before the first alert (sampling rule: 54 h, 55 h across a DST fall-back; realistic case one lost night). ADR-0012 part-6 amendment landed reading **"ACCEPTED under standing authorization — owner signature pending"**. |
> | 2 | `WP-dev-descriptor-no-tree-hash` | **Done** (S) | spec #249, implementation **#252** (`e545033c`) | A dev-stance descriptor no longer hashes the app tree it never authorizes. Re-derivation withdrew two false claims: the ADR-0028 amendment is signed, and the maintainer's install is **prod** stance, so the defect is live only on dev checkouts. |
> | 3 | `WP-dream-digest-omits-own-job-alerts` | **Ready (twice)** | #248, then re-opened and re-closed in **#254** | Closed at round 3 on one model, **re-opened by a confirming round on a second**, redesigned twice on evidence. Final design: the end-of-run render stays unfiltered, byte-identical to `main`; ONE filtered render is the last statement of the locked body; three conjuncts (`findJob`, run token, the record predates this process's start); **no recovery mechanism**. Implementation in progress on `wp/dream-digest-omits-own-job-alerts`, resumed from a paused WIP. |
> | 4 | `WP-dream-report-run-skips` | **Ready** (now M) | **#250** | Re-derived against the five-arm collector. A confirming round reproduced two report sentences as **false** ("will be retried on the next run"; "skipped for the first time") — both removed. **Not dispatched:** its `src/cli/dream.js` cites are stale after #253 and will shift again when #3 lands — one re-pin then, by wd-architect, before dispatch. |
> | 5 | `WP-dream-primary-dialogue-filter` | Draft | feedback **#247** | Maintainer feedback recorded: adopt the direction, **split** into a deterministic projection and a model relevance stage gated on an offline evaluation. The split itself is not done — after #3 and #4 land. |
> | 6 | `WP-secret-sink-wiring-probes` | Draft | — | wd-architect re-derivation in flight (parallel lane). |
>
> **Ruling of the session that changed the most** (verbatim in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` §3): *"Do not use llmp. Use either the Codex plugin or Herdr. Also, use the Astra model, not Sol."* Ten design rounds had already run on `gpt-5.6-sol` through the `codex exec` + `~/.codex-review-home` recipe. Confirming rounds through the Codex plugin on `gpt-6-astra` then **re-opened all three specs Sol had closed or approved**, each with defects reproduced by *executing* production function bodies with mocked I/O. **Do not use the `~/.codex-review-home` recipe again**; the default `~/.codex/config.toml` pins Astra and the plugin takes `--model`. Gate recipe in force: `codex-companion.mjs adversarial-review|review --wait --json --model gpt-6-astra --cwd <detached worktree> --scope branch --base <merge-base>`, `CODEX_HOME` unset, copied `node_modules`, porcelain before/after, raw committed before adjudication. The plugin's native `review` runs in a read-only sandbox and cannot execute filesystem-writing tests — its PR verdicts are readings plus syntax checks, and say so; the executed evidence on a PR is wd-reviewer and CI.
>
> **Owner items taken under standing authorization — each reversible by dated amendment, none a direct ruling** (same logbook file, "Items dispatched under the standing process"). The ones to look at first: digest-omits **O4** (one more digest write per successful dream is one more window for a pre-existing race with an attended `sync`, whose consequence is a false job failure) and **O3** (`wienerdog doctor` reads no alerts at all; after this WP a callout for the dream's own failures reaches the digest only via `sync` or an early quarantine render); stale-lock **O4** (the alert message instructs no deletion) and **O1** (six hours; a legitimately long scheduled dream can trip it). **Still owed by the owner:** the signature line on the ADR-0012 part-6 amendment.
>
> **Routed, not fixed** (each recorded in its spec): `src/core/transcripts/stream.js` declares read-exhaustion against the discovery-time size, so a file growing past the per-session allowance mid-read yields a partial extract treated as complete; `writeFilePrivate` throws `WD_F10_POST_RENAME` on any concurrent writer, no attacker needed; `readAlerts` returns `[]` on a read error, so any digest render can publish alert-free; default X is below the parser's worst-case single extract; a boot identity in the lock payload is the sound basis for automatic takeover; an attended conditional lock-recovery command; `dream_timeout_minutes` has no validated maximum; `skills/wienerdog-dream/SKILL.md:422` names a section heading that no longer exists. **Stale ADR cites, left as they are:** `docs/adr/0012` names `docs/specs/WP-dream-lock-stale-owner-loud.md`, `docs/specs/WP-dream-live-owner-lock.md` and `docs/specs/WP-dream-filtered-input-budget.md`, all now under `docs/specs/done/`.
>
> **Merged tree:** tests 2760 / pass 2748 / fail 0 / skipped 12; lint passed; red-proofs `RUN: PROVEN`, 73 declared.
>
> **Next in the queue:** (1) land `WP-dream-digest-omits-own-job-alerts` (both PR gates on the same tip); (2) wd-architect re-pins `WP-dream-report-run-skips`, then implement it; (3) the primary-dialogue split; (4) parallel lane: `WP-secret-sink-wiring-probes`, `WP-ep2-retention-prune-timing-test`, `WP-broker-e2e-terminal-auth` (needs an interactive terminal-auth spike — left for the owner); (5) the stubs; `WP-a10-windows-reap` stays blocked on a Windows runner. **No npm release has been cut this session.** `WP-contract-reference-tables` is still `In-Review` with its implementing commit on `main` and no traceable PR.
>
> **Status pass, 2026-09-17 #12 (day session — third fork integration; owner-authorized merges).**
> Measured on `main` at `b4af715e`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | fork | `WP-dream-live-owner-lock` | **Done** | PR #245 (`b4af715e`), fork PR #66 | An expired dream lock is no longer stealable while its recorded local PID is alive; unparseable or foreign-host ownership fails loudly. **Recorded residual:** an expired lock whose PID is reused by an unrelated live process returns `busy`, which exits 0 — a silent stop. Routed to `WP-dream-lock-stale-owner-loud`. |
> | fork | `WP-dream-filtered-input-budget` | **Done** | PR #245 (`b4af715e`), fork PR #67 | Whole filtered extracts admitted newest-first within X; equal shares and suffix truncation retired; five disjoint exclusion arms; a run that admits nothing but excluded something now throws. Recorded: default X is below the parser's worst-case single extract; oversized sessions have no durable surface. |
> | fork | `WP-dream-primary-dialogue-filter` | **Draft, arrived** | PR #245 (spec + design-review logbook only) | Held for maintainer feedback. Adopted direction: split into a deterministic primary-dialogue projection (Tables A+B) and a model relevance stage (Tables C+D), the second gated on an offline evaluation of the first. |
> | stale | `WP-dream-report-run-skips` | **Ready → to be returned to Draft** | — | Written against the three-arm collector; cites deleted lines and `sel.truncated`, now always `[]`. wd-architect re-derivation in flight. |
>
> **Rulings of the session** (verbatim in `docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md`): `OWNER-RATIFIED` and `OWNER-SIGNED` are equivalent markers, so the fork's three ADR amendments stand as merged; the proposed order below is adopted; merges authorized for this session only.
>
> **Merged tree:** tests 2754 / pass 2742 / fail 0 / skipped 12; lint passed; CI seven checks pass on #245.
>
> **Next in the queue:** (1) `WP-dream-digest-omits-own-job-alerts` — re-derive against post-#245 `main`, design gate, Ready, implement; (2) `WP-dream-lock-stale-owner-loud` — new, drafted in parallel; **no npm release carrying the new lock ships without it**; (3) `WP-dream-report-run-skips` re-derivation, then implementation; (4) the primary-dialogue split; (5) the parallel lane with no dream-file overlap (`WP-dev-descriptor-no-tree-hash`, `WP-secret-sink-wiring-probes`, `WP-ep2-retention-prune-timing-test`, `WP-broker-e2e-terminal-auth`); (6) the stubs; `WP-a10-windows-reap` stays blocked on a Windows runner. Items 1–4 all edit `src/cli/dream.js` and merge sequentially. **Noted, not acted on:** `WP-contract-reference-tables` is `In-Review` although its implementing commit `609d96b0` is on `main` with no traceable PR.
>
> **Status pass, 2026-09-10 #11 (short day session — ops incident + one spec filed; no merges).**
> Measured on `main` at `5cb4e49b`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | new | `WP-dream-digest-omits-own-job-alerts` | **Draft, filed** | `5cb4e49b` (spec only, local commit on `main`) | **Trigger:** the 2026-09-10 01:30 UTC dream failed closed (pre-dream containment probe: `claude -p` session logged its prompt, received no assistant message within `PROBE_TIMEOUT_MS` 120 s → `ETIMEDOUT` → exit 1, email alert). The 02:00 UTC catch-up re-ran it: ok in 499 s, vault commit `3be46e1`. But the dream's own step-19 `regenerateDigest()` (`src/cli/dream.js:628`, call sites `:705`/`:1167`) renders `state/digest.md` with `unacknowledgedAlerts(readAlerts())` while the failure record is still on file; `run-job.js:1204` `clearAlerts` runs only after the dream returns. So the "job has failed" callout survives one full success and is injected into every session until the next dream (24 h) or an attended `sync`. **WP-041 knew this ("Known one-regeneration lag, accept it") — this spec withdraws that acceptance and keeps WP-041's prohibition on coupling `run-job` to the digest renderer.** Fix = option B: the dream's `regenerateDigest` filters out the records for the job whose success this run establishes, job identity from `WIENERDOG_JOB` (already exported by `buildCleanEnv`, `run-job.js:180`/`:219`) accepted only when `findJob` resolves it to `run: builtin:dream`; every doubt shows the callout. Deliverables: `src/cli/dream.js`, a comment-only narrowing of `src/core/alert-ack.js:127` ("ONLY suppression point"), tests. **Owner ruling recorded in the spec (Out of scope): ship this first; the follow-up WP for a standing managed-policy-hook-warning surface (`run-job.js:953`, whose only lasting surface today is this very bug) is drafted later.** Open for the owner: sign-off on trusting `WIENERDOG_JOB` under the config cross-check; whether the containment probe gets a single retry (recorded under Discovered, out of scope). |
>
> **Ops state after the pass:** `wienerdog sync` run 2026-09-10 12:05 CEST (vendored 0.13.0, one schedule repointed, digest rewritten — stale banner gone); `wienerdog doctor` all `[ok]`; `dream` + `catchup` launchd jobs loaded, exit 0; `app/current` → `0.13.0`. Vault index note: dream commits through a private index by the 2026-08-31 ruling, so `git status` in the vault shows cosmetic staged deletions until `git reset`.
>
> **Next in the queue:** implement `WP-dream-digest-omits-own-job-alerts` (owner intends to implement on return; branch `wp/dream-digest-omits-own-job-alerts`, both review gates per `docs/runbooks/codex-review.md`), then the queue below unchanged: `WP-quarantine-only-copy-shelf` (Draft), routed items to wd-architect, the unfiled three.
>
> **Status pass, 2026-09-06 #10 (night/day autopilot session, owner-authorized merges).**
> Measured on `main` at `8ea9e5d1`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3c-succ | `WP-quarantine-failed-preserve-disposal-flush` | **Done** | design loop #242 (`fdbeb9f2`), implementation #243 (`8ea9e5d1`), filed in this pass | **The O11 successor: a BEST-EFFORT `flushDir` of the removal's parent after each of Table D row D4's two failure-arm removals (`validate.js:984` `tmp`, `:1020` `dest`), gated by `DURABILITY_AVAILABLE` at the call site because `flushDir` itself carries no gate (Table Z row Z4, measured).** A completed POSIX flush closes that act's post-completion window; a flush that does not complete, and every win32 run, retain the residual priced under O10 (Z3 — the flush result does not change what `quarantinePreserve` returns; downstream branch-specific and unchanged). Owner items **O12** (value YES — 2.5–3 ms on an already-failing arm; the success path pays nothing, measured) and **O13** (best-effort; fail-loud priced as the overrule). **Design loop: round zero, two clean-context executors, TWO double-channel rounds** (round 1 HEAVY — Z3 narrowed to the observable contract, the forced-win32 recipe replaced and proven discriminating, Z2's residual written independently, Z5 pinning the comment blocks to V1; round 2 CLOSE — plugin approve, shadow one residual qualifier + one record inaccuracy). **Implementation: two rounds of the triple-channel PR gate** — round 1: plugin CLEAN, shadow one B (the forced-win32 tests counted fsyncs without establishing reach), wd-reviewer REQUEST-CHANGES with the implementation judged correct — the same reach gap (converged), a false `rc=0` pasted for V2, and a SPEC DEFECT: V2's `--wp`-filtered red-proofs run under `set -e` can never pass (the runner rolls unselected pairs up as FILTERED, rc 1) → **erratum 1 landed on the branch before merge** (`3cd68a85`: V2 is the unfiltered run; the `--wp` form a non-gating reading); round 2 on `ae164823`: plugin CLEAN, shadow *"patch is correct"* (zero findings), wd-reviewer **APPROVE** — all six round-1 findings genuinely fixed, four disjoint tracer patch sets, five band-C observations (one erratum, one routed to the predecessor, one routed to wd-architect as a cross-WP ADR-0031 signal). Merged tree: `2699/2687/0/12`, whole-tree `RUN: PROVEN` 66/66 (the two new declarations and the seven pre-existing preserve-durability roll-ups), lint clean. **Two dated errata** in the filed spec (one pre-merge on the branch). |
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus:** O10's class on every failed flush and every win32 run; Z1's same-PID collision; no test reaches what a power loss leaves (by design); the 2-space/4-space comment-line substring hazard in RED `find` literals (third occurrence, recorded).
>
> **Next in the queue:** `WP-quarantine-only-copy-shelf` (Draft, filed; the banner class + O9 + O10), then unfiled — `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up; routed hygiene: ADR-0012's pre-`done/` spec path, the unused `restoreVaultToHead` import.
>
> **Status pass, 2026-09-06 #9 (night autopilot session, owner-authorized merges).**
> Measured on `main` at `66b2b1f8 (the base this loop measured on)`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3c | `WP-quarantine-disposal-durability` | **Superseded** (three acts) → **narrowed**: two acts filed as the new Draft `WP-quarantine-failed-preserve-disposal-flush` | design loop + filing in #241 (`66b2b1f8 (the base this loop measured on)`) | **The value question was answered PER REMOVAL ACT, by measurement — the design gate withdrew the spanning claim after three rounds landed on it.** For M1 (the post-commit temp), M4 (the retention eviction) and M6 (the identity-gated duplicate) the state a crash leaves after a non-durable removal is a state a crash before it already leaves, and each is accepted by a named row (Table F row F2's flush when it completes; Table N rows N3/N5/N6/N7 — eligible for a future prune, may persist; the withheld twin at the identity check, owner-deletable). **For M2 and M3 — Table D row D4's two owned paths, removed on `quarantinePreserve`'s failure arms — the equivalence is FALSE:** the run continues, preserves a withheld copy, publishes and commits a record, and never flushes `redacted/` (QD-P11), so a later power loss resurrects entries a completed run's record omits; decided **(b) a BEST-EFFORT POSIX `flushDir` after each failure-path removal** — a completed flush closes that removal's window; a flush that does not complete, and every win32 run, retain the residual, priced under O10 — as **O11** (M2 measured by QD-P12: a fault before the commit reaches the shared catch, the fallback publishes, the resurrected temp collides at `O_EXCL`; option (a) priced honestly as keeping today's DISCLOSED non-durability — D4 requires none). M6 stays no-flush, priced in **O10** with its post-owner-deletion state named (the owner deletes the withheld twin; a later power loss restores the `redacted/` copy as sole surviving bytes) and the alternative costed; no O12. The measurement that decided it (probes QD-P1–P10): the post-commit temp removal is covered only when the quarantine directory's flush COMPLETES — `flushPreservation` short-circuits on an fsync failure (QD-P6, both arms) and issues no fsync at all on win32 (QD-P7) — and on every non-closing path the leftover is the same deterministic-name temp the failure route already owns (QD-P8: a planted leftover makes the next preservation return `null`, never a cleanup); 400 unflushed unlinks on APFS reappeared 0 times after a clean exit (QD-P1), so only a kernel panic or power loss remains, unstageable; a dedicated flush would replace a 3.5–4.1 ms window with its own 2.0–2.7 ms dirty-directory fsync (QD-P10 vs QD-P2). The round-1 gate corrected two supporting sentences — the retention cap is NOT a schedule (Table N: eligible for a future qualifying prune above the cap; may persist indefinitely, QD-P9) — and the equivalence survived on the corrected text. Measured cost of the flush it would have added: 2.0–2.7 ms per removal on a dirty directory (~500× the clean-directory figure). Recorded as **Table M** (7 rows) in the Superseded spec under `done/`, a dated clause inside Table F row **F7(a)** of `WP-quarantine-preserve-durability`, and owner items **O8** (Superseded), **O9** (the prune-SELECTION question — another live run's fresh `redacted/` copy is selectable for eviction once the pruning run's own set reaches the cap, measured reachable — ACCEPTED and routed) and **O10** (the indefinite, unbannered persistence of a `redacted/` copy — ACCEPT AND NAME recommended; deciding otherwise changes Table N row N7's shipped posture). **The Draft stub `WP-quarantine-only-copy-shelf` is now FILED** (the banner class it already owned, plus O9 and O10), so both routings point at a file. Design gate: round zero (nine-state both-directions proof, later twelve), then FOUR double-channel rounds (plugin + hermetic shadow; eight raws committed pre-adjudication): round 1 DESIGN (three A findings on the disposition's sentences), round 2 DESIGN (the equivalence false at M3 → the universal withdrawn; M2/M3 → the successor), round 3 (O11 re-labelled best-effort; M2 measured; M6 re-modelled), round 4 CLOSE (no decision falsified; two prose items deleted). The gate withdrew one universal sentence, re-labelled one option, re-modelled two rows and filed two stubs; every finding was about the disposition's SENTENCES, none reversed a row's decision. Record `docs/specs/logbook/2026-09-06-quarantine-disposal-durability-design-gate-rounds.md` |
>
> **The dream-promotion epic's durability family is closed:** `WP-quarantine-preserve-durability` Done, its split `WP-quarantine-disposal-durability` Superseded on measurement. The selection and persistence questions live with the now-filed Draft `WP-quarantine-only-copy-shelf`. The move to `done/` also repathed the predecessor's two live pointers to this spec (an unscoped `mirror-walk` caught what the scoped one could not).
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus:** the prune-selection ownership question (O9's home); the `set -e` `!`/`&&` exemption class in verification shells (two broken trees read GREEN before the driver was rewritten — see the record).
>
> **Next in the queue:** `WP-quarantine-only-copy-shelf` (Draft, filed; owns the banner class, O9 and O10), then the unfiled — `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4; and the two routed hygiene items (ADR-0012's pre-`done/` spec path; the unused `restoreVaultToHead` import).
>
> **Status pass, 2026-09-06 #8 (night autopilot session, owner-authorized merges).**
> Measured on `main` at `ba357a81`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | C-succ | `WP-dream-git-env-validate-seam` | **Done** | design loop #236 (`e7f1c957`) + dispatch-time fix #237 (`489f981e`), implementation #238 (`ba357a81`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-06-git-env-validate-seam-design-gate-rounds.md`). Three owner items under the standing authorization: **O4** extend the constructed environment to `validate.js`'s `git()` (one `buildGitEnv()` call, Table U cited not restated); **O5** the nested vault ACCEPTED and named in `assertGitRepo`'s contract — because `wienerdog adopt --yes` was MEASURED to accept a subdirectory of an existing repository (VS-P4), so both hardening answers carry a user-visible cost and are parked; **O6** Table W row W1(c)(i)'s standing trigger disposed by a dated amendment inside the row (its subject is the shape; the stale-stat safety re-measured under the constructed environment, VS-P7). **Round 1 was HEAVY** (the trigger amendment); **round 2 CLOSED** with no product finding after V4 was re-cut BY KIND — two rounds proved no line-oriented check over a JS diff can carry "no spawn added", so the textual step became a labelled completion screen and the invariant moved to AC2's exactly-one-spawn capture plus the reviewer's whole-diff read. **The dispatch-time gate then fired for real (D1):** V4's SHA-equality base guard was unsatisfiable by construction once the Ready PR moved `main`; fixed to a content comparison by a docs PR before dispatch. **Implementation: one round of the triple-channel PR gate** — plugin CLEAN, shadow *"patch is correct"* (zero findings; the three AC tests executed directly), wd-reviewer **APPROVE** with two band-C observations (one filed as erratum 1, one recorded); the implementer's own pre-review pass was disregarded as not the gate. Merged tree: `2693/2681/0/12`, whole-tree `RUN: PROVEN` (`validate-git-inherits-git-dir` PROVEN), lint clean. **One dated erratum** in the filed spec. |
>
> **Audit group C:** the second spawn point now runs under the constructed environment too; what remains for group C is E2's disposition act in `docs/specs/done/WP-audit-c-close-disposition.md` (an architect pass), plus the nested-vault residual now NAMED in `assertGitRepo`'s contract rather than implied.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward, **plus this WP's:** V4's blindness to additions (by design, reviewer-carried); the nested-vault ancestor commit (inferred from code, not measured); the unused `restoreVaultToHead` import in `src/cli/dream.js`; ADR-0012's 2026-09-05 amendment citing the pre-`done/` spec path; size (656-line Ready spec); O6's overrule cost as the queue's largest.
>
> **Next in the queue:** E2's group-C disposition act; `WP-quarantine-disposal-durability` (**Draft**); unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #7 (night autopilot session of 2026-09-05/06, owner-authorized
> merges).** Measured on `main` at `e269f5cd`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | C-D2(b) | `WP-dream-git-env-pinning` | **Done** | design loop #233 (`d6a233ea`), implementation #234 (`e269f5cd`), filed in this pass | **Design loop: round zero, two clean-context executors, and FOUR double-channel rounds** (plugin + hermetic shadow; eight raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-git-env-pinning-design-gate-rounds.md`). **The owner product decision was taken under the standing authorization** (record `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`; O1 pin by construction, O2 the validate.js spawn point to a successor, O3 `XDG_CONFIG_HOME` not carried — each with its overrule cost in the spec). Table U grew from 21 to 24 rows and every Reach cell was re-derived twice from drivers issuing the nine pinned shapes' exact argv; **round 1 fired the DESIGN branch** (one probe used a non-pinned argv), **round 2 fired the ADR-0031 breaker** and the extraction was of KIND — cells keep decided facts, one rationale section owns the reasoning, the record owns the probes — after which every finding landed on a sentence, not a row; **round 3 was HEAVY** (a Deliverables/contract dependency contradiction); **round 4 CLOSED** (plugin approve; shadow three non-product items). Measured along the way and now in Table U: `GIT_CONFIG_COUNT`+`core.fsmonitor` executes code inside the pinned `update-index --add --cacheinfo` and `write-tree`; inherited `GIT_AUTHOR_*`/`GIT_COMMITTER_*` beat `-c user.*` on `commit-tree`; a blob deduplicated against an inherited alternate is never stored in the vault and `fsck` breaks when the alternate goes; `commit-tree` ignores `commit.gpgsign`. **Implementation: one round of the triple-channel PR gate** — plugin CLEAN, shadow *"patch is correct"* (zero findings), wd-reviewer **APPROVE** with three band-C items (one fixed as erratum 1 in this pass, one residual, one informational). Merged tree: `2690/2678/0/12`, whole-tree `RUN: PROVEN` with the three new declarations and the re-targeted one, lint clean. **Two dated errata** in the filed spec |
>
> **The audit status table's group C row closes its last residual by this pass:** D2 (b) — the run's git calls inheriting `process.env` — is retired by construction (`src/core/dream/git-env.js`; ADR-0012 Amendment 2026-09-05; Table W row W1 amended 2026-09-05). Whether group C reads **Done** is E2's disposition act in `docs/specs/done/WP-audit-c-close-disposition.md`; this pass updates the row above to say the successor is Done with its own verification green, and leaves the disposition act to the next architect pass rather than pre-writing it.
>
> **Owner instruction this session, verbatim** (record:
> `docs/specs/logbook/2026-09-05-owner-rulings-git-env-pinning-queue.md`):
> *"Great. Please proceed with the queue. Note that I will go to sleep soon, and you will be on autopilot. Accordingly, try and get as much done as possible. You have merge authorization for this session. And remember to follow the playbook of the project, including the double gate reviews and using subagents."*
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried forward unchanged, **plus this WP's:** the nested-vault discovery question and the second spawn point (owned by the Draft successor `WP-dream-git-env-validate-seam`); the size residual (932-line Ready spec, recorded not trimmed); U8/U9 resting on construction plus the canary rather than a per-channel proof; the unmeasured partial-clone lazy fetch and win32 rows; erratum 2's `PATH` guard asymmetry; E2's group-C disposition act.
>
> **Next in the queue:** `WP-dream-git-env-validate-seam` (Draft stub, filed by this loop), `WP-quarantine-disposal-durability` (**Draft**), and unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named option **(c)** (mid-trim of `References`), the criterion-7 one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #6 (evening session of 2026-09-05, owner-authorized
> merges).** Measured on `main` at `2ccc3d58`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 8 | `WP-process-runbook-sweeps` | **Done** | design loop #230 (`e119b607`), implementation #231 (`2ccc3d58`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-process-runbook-sweeps-design-gate-rounds.md`). The 13 stub bullets measured as **19 atomic rules** against the five process files: 1 ALREADY BOUND (the ADR-0031 breaker), 9 PARTIAL, 8 UNBOUND, 1 UNPAID (R19, zero provenance, not landed — owner item O4); **17 rules landed through 14 edit points, 9 EXTENDing an existing sentence**, `codex-review.md` +4 bullets. **Round 1 fired the pinned DESIGN branch**: the shadow found R12 mis-measured UNBOUND, and the cause was the round-zero sweep using the stub's 13 ids against the 19-row table — the whole set was re-derived with aligned ids (exactly one row moved). Four findings converged across channels, among them the screen reading the WORKING TREE while the WP lands R04 (fixed: `git show HEAD:`, dirty-tree refusal, labelled an anchor-PRESENCE screen blind to meaning, placement and polarity) and R13's "only form is a design question" contradicting the unqualified two-rounds rule (fixed: the bullet opens with the precedence clause). **Round 2 returned no product finding on either channel**; the live criterion gained `docs/HANDOVER.md:371-372`'s band gate as step 0. Clean-context mechanical closure: three band-C items, one dropped with reason (a verification fence is not a program). **Implementation: two rounds of the triple-channel PR gate** — round 1 plugin CLEAN, shadow *"patch is correct"* with zero findings, wd-reviewer REQUEST-CHANGES **with no A finding** (one B: the R12 worked-example sentence transcribed a spec-internal "this WP" into the runbook; three C), EXTEND intactness proven by an 8-word-shingle survival check; round 2 on `3ce5ba57`: plugin CLEAN, shadow *"patch is correct"* (zero findings; round 1 confirmed resolved), wd-reviewer **APPROVE** with one band-C residual (erratum 3). Merged tree: lint clean, screen 21 PASS. **Two dated errata** plus one routed residual in the filed spec |
>
> **Owner instruction this session, verbatim** (record:
> `docs/specs/logbook/2026-09-05-owner-rulings-runbook-sweeps-queue.md`):
> *"I hereby authorize you to perform merges in this session too."* The four
> owner items (O1–O4) were dispatched under the settled recommendation process;
> the record carries a dated amendment with round 1's corrected overrule costs.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop; the adopt-e2e
> Deliverables cell; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`; the durability WP's five;
> audit-D's errata 3–6; audit-E's errata 1, 3 and 4) **plus this WP's:**
> ADR-0031 and `.claude/agents/wd-architect.md:22` say "in one pass" / "in the
> same pass" while `_TEMPLATE.md` now says "and in the same commit" — the ADR is
> the weaker of two surfaces stating one contract (owner's act to amend);
> `_TEMPLATE.md`'s Security-checklist heading says "delete only if" while
> `spec-authoring.md:25-27` requires an `N/A` line in place (the runbook governs;
> the heading is stale); Table B "after :N" insertion points inside a dense list
> should name the neighbouring bullet.
>
> **Next in the queue:** `WP-dream-git-env-pinning` (**owner product decision** —
> the maturing architect records a recommendation with the cost of overruling
> it), then the successors: `WP-quarantine-disposal-durability` (**Draft**), and
> unfiled — `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the
> owner's named option **(c)** (mid-trim of `References`), and the criterion-7
> one-test follow-up from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 #5 (owner-authorized merges).** Measured on `main`
> at `54960a9d`, not transcribed:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | E | `WP-audit-e-ledger-parser-corpus` | **Done** | design loop #225, implementation #226 (`54960a9d`), filed in this pass | **Design loop: round zero, two clean-context executors, and TWO double-channel rounds** (plugin + hermetic shadow; four raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-e-design-gate-rounds.md`). **The ADR-0031 breaker fired TWICE at round 2 and both were answered by EXTRACTION, not a third patch:** duplicate-heading normalisation became *detection on the key the parser CAPTURED*, witnessed by a **generated matrix over ECMAScript `\s` itself** (24 non-LF code points × three reads) after four hand-picked witnesses proved satisfiable by a wrong detector; and the RED-proof sets became a **proof-SELECTION contract** separating TOTAL REACH (measured, may vary by conforming implementation) from SELECTED WITNESSES (declared, graded), carried by the shipped `testNamePattern` facility. Round 2 returned **no product-verdict defect on either channel** and the loop closed under Weighted closure. Product: a **43-row hostile corpus**, **7 declared proofs**, and three live defects closed — trust washing (`TRUE`/`False` read as trusted on both paths), `__proto__` headings invisible to every schema and history loop, and a **duplicate heading in the COMMITTED ledger authorizing a Tier-3 body revision**. **Implementation: two rounds of the triple-channel PR gate** — round 1: plugin clean (52 focused tests), shadow *"patch is correct"*, wd-reviewer **REQUEST-CHANGES with the implementation judged correct** (140/140 Table C assertions) on two test-lane items; **erratum 2 (two Path-A fixtures that could not reach the `authorize` their Today column claims) landed on the branch at `3efcac1f`**; round 2 on that tip: plugin clean, shadow *"patch is correct"* (an in-memory LPC-E mutation confirmed the fail-open is now witnessed), wd-reviewer **APPROVE**, one band-C item routed to erratum 1. **Four dated errata** in the filed spec |
>
> **Measured numbers, and two corrections to the figures circulated with this
> flip.** The merged tree at `54960a9d` is **2684/2672/0/12** with **60 declared
> proofs, 60 selected, RUN: PROVEN**, lint clean. The gate's `2676/2664/0/12` and
> the spec's `44` are both true **of different trees**: `2676/2664` is the branch
> tip `3efcac1f` (re-measured here), and `37 → 44` is criterion 7 against this
> WP's design base `8c52808f`. `WP-audit-d-code-derived-recipients` landed sixteen
> declarations in between, so `main` reads 60, of which **exactly seven are this
> WP's** (`lpc-a-…` through `lpc-g-…`). That gap is **erratum 4**: an acceptance
> criterion phrased as an absolute repo-wide count goes stale without anyone
> touching the spec.
>
> **The audit is effectively closed.** With D and E both Done the five groups read
> **A Done, B Done, C Open (one residual), D Done, E Done** — the single remaining
> item is group C's D2 (b), owned by `WP-dream-git-env-pinning`, and it is an owner
> product decision rather than unfinished work.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop; the adopt-e2e Deliverables
> cell; the basename WP's Table C position clause; the phase-environment contract
> table for `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to
> confirm" sentence vs `--yes`; the orphaned `(ii)` sub-bullet at step 19 in
> `src/cli/dream.js`; the durability WP's five; and audit-D's errata 3–6)
> **plus this WP's errata 1, 3 and 4:** the fixture-helper header comment at
> `tests/unit/dream-validate.test.js:3790-3791` that states the session-id
> convention more broadly than C18 and C40-authorization follow it (erratum 1, band
> C, non-blocking — it should say "on the section last-wins surfaces"); Table D not
> stating that a RED proof's `signal` is a **literal substring of the assertion's
> own message argument** as it reaches the TAP diagnostic, discoverable only by
> running the RED phase (erratum 3); and criterion 7's absolute count (erratum 4).
> **Also recorded, not defects:** the size-ceiling residual **F6** — 594 lines
> against a ~400 ceiling, all contract and corpus, **zero gate machinery added in
> any round** — and **C26's lookup-detector-only reach** as a stated property of
> Table D. **The audit-D input-bound unit question is CLOSED — ruled directly by the
> owner on 2026-09-06 (*"agreed. let us keep characters."*): step 0 stays at 998
> CHARACTERS as item 8 says, step 7 at 998 UTF-8 octets; no output-safety consequence
> either way, and the character bound is the more permissive. Record:
> `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-queue.md`.
>
> **Next in the queue:** `WP-process-runbook-sweeps`, then
> `WP-dream-git-env-pinning` (**owner product decision** — the maturing architect
> records a recommendation with the cost of overruling it). After those, the
> successors: `WP-quarantine-disposal-durability` (**Draft**), and unfiled —
> `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, the owner's named
> option **(c)** (mid-trim of `References`), and the criterion-7 one-test follow-up
> from audit-D's erratum 4.
>
> **Status pass, 2026-09-06 (day session of 2026-09-05, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | D | `WP-audit-d-code-derived-recipients` | **Done** | design loop #223, implementation #224 (`ee11229f`), filed in this pass | **Design loop: round zero, two clean-context executors, and SIX double-channel rounds** (plugin + hermetic shadow; twelve raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`). **The ADR-0031 breaker fired at round 2** on Table B and the answer was a CONTRACT — the recipient derivation restated as **an ORDER of operations over raw values, bounds before parsing**; every finding across two rounds had been the same defect, parsing before bounding. **The stop criterion fired twice.** At round 3 it was ruled by the orchestrator under the standing instruction as **item 9** (keep the code-derived-recipient verb; the findings were the ORDER contract not yet applied to its own rows). At round 4 the **FINAL** criterion fired on derived header lines exceeding RFC 5322's 998 octets, Table B was **frozen**, and an owner brief was written — answered by the owner's **DIRECT ruling (a)**, refuse at the output, which became **item 10** and the first non-standing-instruction decision of the queue. **Round 6 returned zero product findings on both channels** and the loop closed under Weighted closure, verified by an independent clean-context executor. **Implementation: two rounds of the triple-channel PR gate** — round 1 plugin clean (a reading; its tests were sandbox-blocked, disclosed), shadow *"patch is correct"* with zero findings, wd-reviewer REQUEST-CHANGES **with no product finding** (a spec contradiction inside Table C); **errata 1 (the vendored-skill digest anchor missing from Deliverables) and 2 (a mutation parenthetical contradicting its own table's rule) landed on the branch** before merge; round 2 APPROVE / clean / *"patch is correct"*. Merged tree: `2638/2626/0/12`, **53 proofs PROVEN**, lint clean. **Six dated errata** in the filed spec |
> | E | `WP-audit-e-ledger-parser-corpus` | **Ready → implementation PR #226 open, gate round 1 in progress** at the time of writing | design loop #225 | Round zero, two clean-context executors and **two double-channel rounds**; **two ADR-0031 extractions**; a **43-row hostile corpus** and **44 declared proofs** |
>
> **Owner rulings this session, verbatim.** Merges were authorized for the
> session: *"You are hereby authorized to perform merges in this session. Go
> ahead and merge 223 once you are ready for it."* And the audit-D escalation was
> ruled **directly**, after the owner read the ruling brief: *"go with a) as you
> recommended"* — recorded on its own in
> `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`,
> deliberately kept apart from the nine items dispatched under the standing
> instruction (`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-queue.md`).
> **A tree should be able to tell a decision the owner made from a
> recommendation dispatched under a standing authorization**, which is why the
> two records are separate.
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop grading against the
> pre-filesystem spelling; the adopt-e2e Deliverables cell's setup enumeration
> omitting the PATH stub; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`; and the durability WP's five)
> **plus this WP's errata 3–6:** the one `[AUD-D*]` assertion with no band marker
> at `tests/unit/broker-verbs.test.js:626`, which is a test-constructed
> precondition no product mutation can redden — the rule needs a carve-out and
> the mechanical check it has always lacked (erratum 3, successor
> `WP-red-proofs-marker-audit`, **not filed**); acceptance criterion 7's second
> clause, unasserted by V1 though reviewer-verified TRUE — a one-test follow-up
> (erratum 4); the `classesFor` pass-through alias at
> `src/cli/gws-broker.js:102`, semantically identical and pinned through by both
> RED proofs (erratum 5, hygiene); and erratum 2's missing Mirrored Surface
> Checklist line, **fixed in this pass** (erratum 6). **Plus the OPEN owner
> question:** whether the input bound should be restated in UTF-8 octets to match
> the output bound — **no output-safety consequence either way, but availability
> differs**, and the character bound as ruled is the more permissive.
>
> **Next in the queue:** `WP-audit-e-ledger-parser-corpus` (finish the gate,
> merge, done-flip), then `WP-process-runbook-sweeps`, then
> `WP-dream-git-env-pinning`; after those the successors —
> `WP-quarantine-disposal-durability` (**Draft**), and unfiled:
> `WP-quarantine-only-copy-shelf`, `WP-red-proofs-marker-audit`, and the owner's
> named option **(c)**, mid-trim of `References`.
>
> **Status pass, 2026-09-05 (overnight continuation #3, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3b successor | `WP-quarantine-preserve-durability` | **Done** | design loop #220 (`bb58e398`), implementation #221 (`c891e0b6`), filed in this pass | **Design loop: round zero plus ELEVEN double-channel rounds** (plugin gate + hermetic shadow on every one, twenty-two raws committed pre-adjudication; record `docs/specs/logbook/2026-09-05-quarantine-preserve-durability-design-gate-rounds.md`). **The ADR-0031 circuit breaker fired TWICE and both times the answer was a CONTRACT, not a third patch** — round 2, the same-UID substitution family → Table F row **F10, THE ADVERSARY** (GUARANTEED / DISCLOSED / OUTSIDE, on `docs/THREAT-MODEL.md`'s A12); round 9, the flushed-bytes clause → **"an ORDER, not a COVERAGE"**. **Escalation (ii) parked FOUR owner items** (5 at round 2, 6 at round 4, 7 at round 6, 8 at round 9), taking the Dispatch precondition to **eight**, all eight ruled under the owner's standing *"go with your recommendations"* (record: `docs/specs/logbook/2026-09-05-owner-rulings-durability-queue.md`; the owner may reverse any by dated amendment, each with a stated cost). **Implementation: three rounds of the triple-channel PR gate** — round 1 wd-reviewer REQUEST-CHANGES **with no `src/` change requested** (a permission-boundary overrun it judged a SPEC defect, plus six declined V1/V2 states the reviewer ran itself), plugin P2 (win32 flush assumption), shadow two C; round 2 APPROVE with the census escalated, **one P2 converged across plugin and shadow**; round 3 APPROVE / *"patch is correct"* / one AIX P2. Merged tree: `npm test` `2630/2618/0/12`, `npm run red-proofs` 37/37 `RUN: PROVEN` with seven roll-up lines, lint clean. **Five dated errata** in the filed spec |
> | 3c | `WP-quarantine-disposal-durability` | **Draft** (stub) | — | The SPLIT (owner item 4). `depends_on` the durability spec; inherits the protocol, and with it the D1/D2 removals and `pruneRedactedOriginals`' eviction, which are still not crash-durable |
>
> **The audit status table's group C row is unchanged by this pass** — still its
> one residual (D2 (b), `WP-dream-git-env-pinning`).
>
> **Residuals routed to wd-architect, not dispatched** — the earlier list carried
> forward unchanged (the dot-segment spec's V2 B3 loop grading against the
> pre-filesystem spelling; the adopt-e2e Deliverables cell's setup enumeration
> omitting the PATH stub; the basename WP's Table C position clause; the
> phase-environment contract table for `scripts/red-proofs.js`; ADR-0010's
> "adopt requires the user to confirm" sentence vs `--yes`; the orphaned `(ii)`
> sub-bullet at step 19 in `src/cli/dream.js`) **plus this WP's errata:** the
> Deliverables prose census extracted into a canonical table with criterion 10
> asserting the table (erratum 1, and the THIRD stale test title at
> `tests/unit/dream-validate.test.js:2442` that the two-title boundary forbade
> fixing); the missing **F3 chain-membership** bullet in the Mirrored Surface
> Checklist (erratum 2); `O_DIRECTORY` OR'd unguarded at
> `src/core/dream/validate.js:672-675` (erratum 3, cosmetic); row **F5**'s
> platform wording — name `darwin` and `linux` as the supported POSIX platforms
> and record other POSIX as neither measured nor supported (erratum 4); the D3
> observer comment saying "by INODE" over a fixture that keys on the fd number
> (erratum 5).
>
> **Next in the queue:** `WP-audit-d-code-derived-recipients`,
> `WP-audit-e-ledger-parser-corpus`, `WP-process-runbook-sweeps`,
> `WP-dream-git-env-pinning`. **Product decision, settled by the 2026-09-05
> rulings record — it settled the PROCESS, not just the eight items:** the
> maturing architect records a recommendation with the cost of overruling it,
> and the session may dispatch under that recommendation, the owner reversing
> any of them by dated amendment. Two proposed successors stand behind the
> queue: `WP-quarantine-only-copy-shelf` (**not filed**) and
> `WP-quarantine-disposal-durability` (**filed, Draft**).
>
> **Status pass, 2026-09-05 (overnight continuation #2, owner-authorized
> merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 3b | `WP-quarantine-banner-location` | **Done** | design loop #217 (round zero + 5 double-channel rounds; **circuit breaker at round 2** — two consecutive A findings on "is the pointer's destination real?" were settled by DELETING the defect: row L7 reorders the undelivered-record print to step 17b, ahead of every durable write, which removes the crash window instead of narrowing the sentence a third time; round 3 moved the fault-injection seam to the ledger boundary, the first durable claim; **round 4's plugin run was voided by an orchestrator write into the reviewed worktree** and made good at round 5, where both channels were valid and returned one wording finding), implementation #218 (**one round** of the triple-channel PR gate, clean on the first tip: wd-reviewer APPROVE, plugin clean, shadow "patch is correct"; **four Band C findings → four dated errata** in the filed spec), filed in this pass | The four ledger-derived carriers (Table L rows L1–L4) now render one code-owned `PRESERVED_COPIES_POINTER` sentence naming no folder and instructing no delete; two RED-proof declaration files, four hand-written identities, five roll-up lines. **Dispatched under three architect recommendations the owner may reverse by dated amendment** (record: `docs/specs/logbook/2026-09-05-owner-rulings-banner-queue.md`): (1) confirm the four surfaces; (2) route L5's clearing sentence to `WP-quarantine-only-copy-shelf` rather than absorb it — `src/core/digest.js` stayed outside the boundary; (3) accept the pre-upgrade legacy crash-window record as a named residual, decided in Table L row **L0**, its durable half inherited by `WP-quarantine-preserve-durability` |
> | 3c | `WP-quarantine-preserve-durability` | Draft → in design | — | wd-architect matured it to **1043 lines** at `284144db` on `docs/wp-quarantine-preserve-durability`. **SPLIT**: `WP-quarantine-disposal-durability` filed as a Draft stub on that branch. Four owner items, each carrying a recommendation. Round zero is done; the external double-channel rounds are next |
> | 6–9 | unchanged | Draft | — | — |
>
> Round records and raws: `docs/specs/logbook/2026-09-05-quarantine-banner-*`.
> **Residuals routed to wd-architect, not dispatched** — the earlier list,
> carried forward unchanged, plus one new: the dot-segment spec's own V2 B3 loop
> grades against the pre-filesystem spelling (state the B3 pre-step once —
> `topLevelDirs`' `readdirSync`, then `pick`'s trim, then the `reports_dir` join
> — with V2 and the test file as registered mirrors); the adopt-e2e Deliverables
> cell's setup enumeration omits the PATH stub; the basename WP's Table C
> position clause; the phase-environment contract table for
> `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to confirm"
> sentence vs `--yes`; **NEW —** the orphaned `(ii)` sub-bullet left at step 19
> in `src/cli/dream.js` by row L7's move (erratum 2 of the filed banner spec
> accepts the orphan on the record; a successor with an independent reason to be
> in that block may renumber it as part of step 19). The audit status table
> above is unchanged by this pass — group C still has its one residual
> (D2 (b), `WP-dream-git-env-pinning`).
>
> **Status pass, 2026-09-05 (overnight continuation of the 09-04 session,
> owner-authorized merges).** Measured on `main`:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 4→ | `WP-dot-segment-denial` | **Done** | design loop #214 (round zero + 3 double-channel rounds; circuit breaker at round 2 — two hand-shaped sample families replaced by EQUALITY with a one-line reference predicate over a seeded full-alphabet generator; round 3 hardened the grading's inputs), implementation #215 (three-round triple-channel PR gate: PATH stub for the adopt round-trip test, `readdirSync`-derived B3 spelling, a non-vacuous seven-key round-trip oracle), filed in this pass | The class rule is enforced at `makeAdmit` (loop placed LAST), `isSafeRelativePath` (shared by `layout.js` and `layout-infer.js`) and thereby `adopt --yes`; two RED proofs over six named test identities. Dispatched under the architect's recommendation (the reader's per-key silent fallback stays silent) — the owner may reverse by dated amendment |
> | 3b, 6–9 | unchanged | Draft | — | next: `WP-quarantine-banner-location` → `WP-quarantine-preserve-durability` (owner-sequenced), `WP-audit-d-…`, `WP-audit-e-…`, `WP-process-runbook-sweeps`; `WP-dream-git-env-pinning` still needs the owner's product decision |
>
> **Residuals routed to wd-architect, not dispatched:** the dot-segment spec's
> own V2 B3 loop grades against the pre-filesystem spelling (state the B3
> pre-step once — `topLevelDirs`' `readdirSync`, then `pick`'s trim, then the
> `reports_dir` join — with V2 and the test file as registered mirrors); the
> adopt-e2e Deliverables cell's setup enumeration omits the PATH stub; the
> basename WP's Table C position clause; the phase-environment contract table
> for `scripts/red-proofs.js`; ADR-0010's "adopt requires the user to confirm"
> sentence vs `--yes`. Audit group C is down to ONE residual (row below).
>
> **Status pass, 2026-09-04 (owner-authorized merges; rulings given at
> ~12:50).** Measured on `main` at the time of writing, not from memory:
>
> | # | Spec | State | Landed in | Note |
> |---|------|-------|-----------|------|
> | 2 | `WP-index-guard-residuals` | **Done** | #203, filed #207 | — |
> | 3a | `WP-preservation-abort-widening` | **Done** | #205, filed #207 | successor `WP-quarantine-preserve-durability` stays Draft, owner-sequenced after 3b |
> | 4 | `WP-audit-c-close-disposition` | **Done** | #202, filed #207 | group C row below: D1 (c) is now CLOSED in code (see next row); D1 (b)/D5 and D2 (b) stay open |
> | 5 | `WP-criterion-red-harness` | **Done** | #204, filed #207 | ADR-0042 **owner-signed** 2026-09-02, landed #208; successors `WP-red-proofs-{ci-lane,doctrine,adopt-index-guard}` still proposed ids, not filed |
> | 4→ | `WP-instruction-basename-currency` | **Done** | design loop #210 (round zero + 3 double-channel rounds, circuit breaker at round 2 — the loop closed by DELETING machinery: whole-artifact byte compares + one hand-written literal set), implementation #211 (two-round triple-channel PR gate), filed #212 | `INSTRUCTION_BASENAMES` is nine names; `docs/instruction-file-inventory.md` is GENERATED by V3 `--write`, never hand-edited; `docs/runbooks/release.md` step 2 carries the re-inventory obligation. Dispatched under the architect's two recommendations (deny all nine incl. `replit.md`/`AGENT.md`; obligation owner = the release-maintainer role) — the owner may reverse either by dated amendment |
> | 4→ | `WP-dot-segment-denial` | Draft → in design | — | wd-architect maturing on `docs/wp-dot-segment-denial`; closes the sibling's 17 HANDOFF rows |
> | W1 | wording follow-ups from #203/#204/#205 | **Done** | #209 | seven routed findings closed with dated errata; the `computed` JSDoc is a registered residual in W1(c) |
> | 3b, 6–9 | unchanged | Draft | — | — |
>
> Round records and raws: `docs/specs/logbook/2026-09-04-*`. **Residuals
> routed to wd-architect, not dispatched:** the Table C position clause for
> the basename WP (the re-inventory step must precede the bump and publish —
> say so in prose; V4 stays rot-free); no canonical table yet for the
> phase-environment contract in `scripts/red-proofs.js` (owner contract
> decision). **Process:** the herdr shadow's auto-approver is blocked by the
> permission classifier; the shadow now runs as
> `codex exec -s read-only -o <file>` with `CODEX_HOME=~/.codex-review-home`
> (no approvals, report captured verbatim; its sandbox denies even OS-temp
> writes, so mutant probes run in memory).
>
> **Status pass, 2026-09-02 (overnight autonomous run, owner-authorized
> merges).** Items 1–5 below have all been through the double-gate design loop;
> none is implemented — each is `Ready` and parked on an owner ruling recorded
> in its Dispatch precondition. Measured, not from memory:
>
> | # | Spec | State | Landed in | Owner item parked |
> |---|------|-------|-----------|-------------------|
> | 1 | `WP-show-slot-own-value-kind` | **Done** | #192–#195 | — |
> | 2 | `WP-index-guard-residuals` | Ready | #196 | **ruled 2026-09-02: ratified** — see `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md` |
> | 3a | `WP-preservation-abort-widening` (+ Draft `WP-quarantine-preserve-durability`) | Ready (M) | #197 | **ruled 2026-09-02: fail-loud confirmed; durability WP sequenced after the banner WP** |
> | 3b | `WP-quarantine-banner-location` | Draft | — | depends on 3a |
> | 4 | `WP-audit-c-close-disposition` (+ Draft `WP-dot-segment-denial`, `WP-instruction-basename-currency`; amendment to `WP-dream-git-env-pinning`) | Ready | #199 | **ruled 2026-09-02: QUEUED (option i)** — basename-currency then dot-segment-denial in normal order; the gate had found M7 LIVE beneath tiers and M9's environment half LIVE (`GIT_DIR` / `GIT_OBJECT_DIRECTORY`); **group C stays Open** |
> | 5 | `WP-criterion-red-harness` (+ ADR-0042) | Ready (M) | #198 | **ruled 2026-09-02: ADR-0042 signed; Node options stay parked per the spec's recommendations** |
> | 6–9 | unchanged | Draft | — | — |
>
> Round records and raw gate outputs: `docs/specs/logbook/2026-09-01-*` and
> `2026-09-02-*`. The audit status table above is NOT updated here — row C's
> cell is `WP-audit-c-close-disposition`'s own deliverable.
>
> **Status pass, 2026-09-02 afternoon (owner rulings landed; every Ready WP
> implemented).** The four parked rulings were given on 2026-09-02 (record:
> `docs/specs/logbook/2026-09-02-owner-rulings-stub-queue.md`, PR #201) and all
> four Ready WPs went through implementation and the PR double gate (wd-reviewer,
> Codex plugin and hermetic herdr shadow, raws committed pre-adjudication under
> `docs/specs/logbook/2026-09-02-*-pr20N-raw-round*`). Measured at the time of
> writing:
>
> | # | Spec | PR | Rounds | Gate state | Merge note |
> |---|------|----|--------|------------|------------|
> | — | owner rulings record | #201 | — | docs-only, CI green | merge FIRST (the #202 stubs and logbook cite it) |
> | 2 | `WP-index-guard-residuals` | #203 | 2 | APPROVE / shadow clean / plugin P2 residual (concurred, routed to wd-architect) | any order |
> | 3a | `WP-preservation-abort-widening` | #205 | 4 | APPROVE / clean / clean | after #203 (both touch `src/cli/dream.js` comments and the done specs) |
> | 4 | `WP-audit-c-close-disposition` | #202 | 3 | APPROVE / clean / 1×C fixed; files `WP-instruction-basename-currency` and `WP-dot-segment-denial` as Draft stubs; group C row below reads **Open — four residuals** once merged | after #201 |
> | 5 | `WP-criterion-red-harness` | #204 | 14 | plugin CLEAN / wd-reviewer APPROVE / shadow clean on f729ba04; nineteen gate-found defects closed (see the PR's closing comment) | last |
>
> **What the gates caught after the implementers' own green** (the reason the
> rounds exist): #204 — pinned TAP shapes were Node-25-only and CI's Node 20 went
> red; six false-PROVEN paths (alias `..`, accepted zero-run CONTROL, dropped
> namesake test, ignored added declaration, `-`-prefixed suite path, UTF-8
> decode rewriting bytes outside the mutation). #205 — a `.tmp-${pid}` overwrite
> of a crash leftover, then the fix's own regression (ownership recorded after
> the whole write; reproduced with a real `ulimit -f` EFBIG). #202 — Table D
> cells claiming more than V1/V2 recorded, fixed by making V2 (b) prove the
> claims; tier-local `copilot-instructions.md` is not a documented Copilot path.
>
> **Follow-ups for wd-architect, not dispatched:** the W1 wording family from
> #203 (positional citations in `docs/specs/done/WP-show-slot-own-value-kind.md`
> rotted by the test file's growth; the `computed` JSDoc; the (c)(i)/(c)(ii)
> scope framing); `docs/specs/done/WP-secret-fence-ep2-redact-arm.md:1565`
> (B3b's action cell instructs carrying the basename, which the pair rule now
> forbids); `WP-criterion-red-harness.md:446` (stale round-5 "provided set" line).
>
> **Next in the queue:** `WP-quarantine-banner-location` →
> `WP-quarantine-preserve-durability` (owner-sequenced 2026-09-02);
> `WP-instruction-basename-currency` → `WP-dot-segment-denial` (ruled option
> (i), QUEUED); items 6–9 unchanged; `WP-dream-git-env-pinning` still needs the
> owner's product decision.

Every item below has a Draft spec stub. **The stubs are deliberately Draft:
they carry the context, the intent, the known traps and the done-definition,
but they have NOT been through spec review.** Maturing one to Ready (via
`wd-architect`) is the first step of picking it up. Do them one at a time.

1. `WP-show-slot-own-value-kind` — the one open *spec decision* from the
   promote-in family's guard (a `show` option-position gap + a mirror drift).
2. `WP-index-guard-residuals` — three small measured residuals from the same
   family (one is a one-line fix).
3. `WP-preservation-abort-widening` then `WP-quarantine-banner-location` —
   two small, fully measured fixes; sequenced in that order by owner ruling.
4. `WP-audit-c-close-disposition` — measure C2 (git seam) and C3 (layout)
   against the landed architecture; much of both is likely mooted by the
   promote-in inversion, but "likely" is not a disposition.
5. `WP-criterion-red-harness` — the test-quality harness. This session found
   **ten-plus vacuous (false-green) assertions**, every one via mutation, none
   via existence checks. Highest-leverage protection for all future work.
6. `WP-audit-d-code-derived-recipients` — the larger of the two untouched
   audit groups.
7. `WP-audit-e-ledger-parser-corpus` — the smaller untouched group, with a
   measured history of expensive verification: watch the size discipline.
8. `WP-process-runbook-sweeps` — codify the paid-for working disciplines into
   the runbooks (docs-only).
9. `WP-dream-git-env-pinning` — a registered product-hardening *candidate*;
   requires an owner product decision, not just implementation.

## What to watch for (the compressed discipline)

These rules were each paid for at least once in this program. The full set is
in `memory/lessons/inbox.md`; these are the ones that prevent the expensive
failure modes:

- **The proof of a fix is the re-grep/re-run, never the edit.** Report what
  the tool printed, not what you intended.
- **Read the tool's own summary, not your regex's match count.**
- **A +0 test delta on a test that dies before your change proves nothing**
  — check *where* it dies relative to what you touched.
- **`+0/−0` beside a claimed content change is a failure signature** (a
  `git mv` + unstaged edit). Prove the commit (`git show HEAD:<path>`), not
  the working tree.
- **Prove a mutation was applied before believing its matrix** (grep the
  injected marker); a guard must notice its own death.
- **Enumerating the BAD is unclosable when the grammar isn't yours;
  enumerating your OWN GOOD is closable** — the promote-in guard's central
  result; respect it in any allowlist/denylist design.
- **Distinguish FORM insufficiency from a PREDICATE defect** before reopening
  a review loop: form = the deciding facts never reach the observation point;
  predicate = the facts are there, the question is wrong. Only form is a
  design question.
- **Two consecutive review rounds on one contract family → extract the
  contract (ADR-0031), never a third patch.** Measured: two rounds of
  patching injected four defects; one contract round injected zero.
- **Sweep claims, not sentences**: whitespace-flattened, pronoun-aware,
  family-wide; a file swept by hand is not inside its own proof.
- **Materiality bands on every review round** (A: silent wrong behavior with
  data-loss/security consequence; B: caught downstream; C: hygiene). Counts
  without bands are not decision-grade.

## Process notes

- The review-gate flow that converged: two independent gates on the SAME tip,
  both verdicts on that tip, a pinned reading before each round ("clean or
  C-only → proceed; anything above C returns banded"), and a stop criterion
  pinned in advance for repeated same-family findings.
- CI runs are billing-blocked on this fork at handover time; the local gate
  protocol is in `memory/` history and PR bodies: run `npm test`,
  `npm run lint` and `scripts/boundary-check.js` on the simulated merge and
  paste outputs into the PR body. `tests/integration/adopt-e2e.test.js` is
  always red on the original machine (machine-local executable pin) — that
  failure is environmental; see the +0-delta rule above before trusting it.
- `gh` may resolve this checkout to the upstream repo — always pass
  `--repo <your fork>` explicitly.
