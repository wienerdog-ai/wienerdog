---
id: WP-memory-import-hermetic-canary
title: Measure whether a hermetic run loads user-level CLAUDE.md — the research gate that unblocks the block-as-reference change
status: Draft
model: opus
size: S
depends_on: []
adrs: [ADR-0004, ADR-0025, ADR-0039]
epic: digest-delivery
---

# WP-memory-import-hermetic-canary: measure it before ADR-0039 §2 ships

## Context (read this, nothing else)

ADR-0039 (Proposed) replaces the digest **copy** in the `~/.claude/CLAUDE.md`
**managed block** with a memory **import** of the digest's absolute path, and
de-registers the now-redundant Claude Code SessionStart hook. That change is gated on
one unmeasured fact, recorded in ADR-0039's Consequences as the only open
measurement:

> Whether `--setting-sources ''` (emitted by `composeClaudeArgs` in
> `src/core/runtime-profile.js` for every hermetic run) also suppresses user-level
> `CLAUDE.md` is **not documented**.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP writes a test script and a
findings entry. It ships no product change and opens no gate.

**Why it matters.** Wienerdog's unattended jobs (the nightly `dream`, the routines)
spawn `claude -p` under a **hermetic runtime profile** (ADR-0025): an explicit
`--tools` allowlist, `--strict-mcp-config`, a hook-free `--settings` file, and
`--setting-sources ''` whose in-code comment claims it "loads NOTHING ambient". The
dream's brain reads the user's own transcripts, which include external `tool_result`
content — so what else is in that brain's context is a security question, not a
cosmetic one.

**The verdict is BLOCKING (round-2 finding F4).** Round 1 made this WP a measurement
whose adverse outcome had no consequence — "report, do not decide" — which is not a
gate at all. It now is one. `WP-managed-block-by-reference` depends on this WP, and
this WP's Done criteria are **disjunctive**:

**This WP is Done when the measurement is recorded — under either verdict.** Round 2
made Done depend on `WP-hermetic-user-memory-suppression` being merged, while that WP
`depends_on` this one: a **dependency cycle** neither could exit (Codex round-2 R6).
The gate lives on the *consumer* instead:

| Verdict | This WP | `WP-managed-block-by-reference` proceeds when |
|---------|---------|----------------------------------------------|
| **not loaded** | Done once the finding is recorded | this WP is Done |
| **loaded** | Done once the finding is recorded **and** `WP-hermetic-user-memory-suppression`'s Current state is filled in | this WP is Done **and** `WP-hermetic-user-memory-suppression` is Done |

So an adverse measurement still stops the block-shape work until it is resolved, but it
stops it at the WP that would ship the change — not by making this WP wait on its own
descendant. "Report, do not decide" still governs *this* WP's code — you do not change
`composeClaudeArgs` here — but the reporting now has teeth.

Two outcomes, and both are actionable:

- **If user-level `CLAUDE.md` is NOT loaded** in a hermetic run, ADR-0025's "no
  ambient authority inheritance" claim holds as written, and the import line changes
  nothing about hermetic runs. ADR-0039 §2 proceeds unchanged.
- **If it IS loaded**, then the managed block **already** carries the whole digest
  into the dream's own brain today — a pre-existing condition ADR-0025 does not
  describe, and one the SessionStart hook's `WIENERDOG_JOB` guard was written to
  prevent for the hook channel ("so unattended runs start context-free and never
  re-read state mid-job"). ADR-0039 §2 would then change only *which* digest reaches
  that brain (last-sync bytes → current bytes), which is not a regression — but the
  finding needs recording against ADR-0025, and the owner may want the import line
  scoped or the hermetic argv extended.

Researcher facts already established (fetched 2026-08-30,
`https://code.claude.com/docs/en/memory`): `claude -p` loads `CLAUDE.md` **unless
`--bare` is passed**; `@path` imports in user-level `CLAUDE.md` are supported for
relative, absolute and `~`-prefixed paths, load without the project-scope approval
dialog, resolve **at session launch**, allow **4 hops**, are ignored inside code
spans and fences, and a `CLAUDE.md` over 4 MiB is skipped. What is *not* documented is
the interaction between `--setting-sources ''` and memory loading. That interaction is
what this WP measures.

**The method is the one this repo already uses.** ADR-0025 Amendment 2 established the
**bounded live canary probe**: run the *real production hermetic composition* against a
disposable canary workspace and assert an observable property, rather than pinning a
Claude version and trusting the docs. Amendment 3 extended it to routines. This WP is
the same pattern applied to one new property.

## Current state

`src/core/runtime-profile.js` is a **pure** module (no fs, no child_process, no env,
no network) that defines the profile registry and composes argv. `composeClaudeArgs`
emits, for every hermetic run:

```js
return [
  '-p', prompt,
  '--tools', profile.tools.join(','),
  '--disallowedTools', profile.disallowedTools.join(','),
  '--permission-mode', profile.permissionMode,
  ...(profile.mcp === 'broker'
    ? ['--allowedTools', profile.brokerVerbs.map((v) => `mcp__${BROKER_SERVER_NAME}__${v}`).join(',')]
    : []),
  ...addDirs.flatMap((d) => ['--add-dir', d]),
  '--strict-mcp-config',
  ...(mcpConfigPath ? ['--mcp-config', mcpConfigPath] : []),
  // Empty value — loads NOTHING ambient (measured-accepted and
  // source-excluding on 2.1.212; D-SETTING-SOURCES, OWNER-APPROVED 2026-07-18).
  '--setting-sources', '',
  '--settings', settingsPath,
  ...(appendSystemPrompt ? ['--append-system-prompt', appendSystemPrompt] : []),
  ...(model ? ['--model', model] : []),
];
```

The comment's "loads NOTHING ambient" was measured against **settings sources**. It
was never measured against **memory files**, which are a separate loading mechanism.

`templates/hooks/session-start.sh` guards the *hook* channel against exactly this:

```bash
# Skip during Wienerdog's own scheduled jobs (dream/digest) so unattended runs
# start context-free and never re-read state mid-job.
[ -n "${WIENERDOG_JOB:-}" ] && exit 0
```

There is no equivalent guard for the managed-block channel, because a managed block is
just bytes in a file the harness loads on its own.

Existing live harnesses to model this on: `tests/scenarios/a7-integrity/run-a7-integrity.js`
(disposable temp `$HOME`/`WIENERDOG_HOME`, removed in `finally`, honest boundary
statement in its header) and `tests/scenarios/run-scenarios.js`. `package.json` already
registers per-harness scripts (`scenarios`, `scenarios:negative`, `broker:selfcheck`,
`scenarios:broker-e2e`, `scenarios:a7-integrity`).

## Deliverables (permission boundary — touch ONLY these)

| Action | Path | Notes |
|--------|------|-------|
| create | tests/scenarios/memory-canary/run-memory-canary.js | the live probe; opt-in, never in `npm test` |
| create | tests/scenarios/memory-canary/README.md | how to run it, what each verdict means |
| modify | package.json | add `"scenarios:memory-canary"` script only |
| create | docs/specs/logbook/2026-08-30-hermetic-user-memory-canary.md | the recorded finding, filled in after the run |
| modify | docs/specs/WP-hermetic-user-memory-suppression.md | **adverse branch only** — fill in its Current-state placeholder with the measured fact (AC-9). On the *not loaded* branch, flip its `status:` to `Superseded` with a one-line pointer to the logbook entry |

**Note on the logbook file:** create it in the same PR with the measured result. It is
the deliverable — a probe whose finding is not written down has not gated anything.

### Exact contracts

```js
/** Run the canary. Spends real model quota (one tiny prompt per case).
 *  @returns {Promise<{loaded: boolean, evidence: string, argv: string[]}>}
 *  loaded — true iff the canary token from the temp user-level CLAUDE.md appeared
 *  in the model's reply under the REAL hermetic argv. */
async function runMemoryCanary(opts)
```

**Probe design.** For each case: create a disposable `$HOME`, write a user-level
`CLAUDE.md` there containing a unique high-entropy token and an instruction to echo it,
compose the argv with the **real** `getProfile('dream')` + `composeClaudeArgs`, run
`claude` with `HOME` pointed at the temp dir, and check whether the token appears in
stdout.

**Four cases, all required:**

| Case | User `CLAUDE.md` | Import file | Asserts |
|------|------------------|-------------|---------|
| A | token inline | none | whether user-level `CLAUDE.md` is loaded at all under the hermetic argv |
| B | `@<abs path>` import only | token inside | whether an **absolute** import resolves |
| C | `@~/…` import only | token inside | whether a `~`-prefixed import resolves |
| D | `@<abs path>` import only | **file absent** | that a missing target degrades silently — no crash, no error text |

Cases B–D also serve `WP-managed-block-by-reference`: they are the direct evidence for
the import mechanics ADR-0039 §2 relies on, measured against the installed Claude
rather than the docs.

**Non-vacuity control (required).** A fifth run with the token in the **prompt itself**
must return `loaded: true`. Without it, a probe that silently fails to reach the model
reports "not loaded" for every case and looks like a clean result. This repo has been
bitten by exactly that class (WP-082 canary class, cited in the A7 runner's header).

## Contract reference

N/A — this WP produces a measurement and a record, not a contract other code consumes.
The facts it establishes are consumed as prose by `WP-managed-block-by-reference` and
as an amendment candidate for ADR-0025.

## Implementation notes & constraints

- **Use the real composition, never a hand-written argv.** Import `getProfile` and
  `composeClaudeArgs` from `src/core/runtime-profile.js`. A probe against a
  reconstructed argv measures the reconstruction, not production. This is the specific
  lesson ADR-0025 Amendment 2 recorded.
- **Opt-in only.** This spends model quota and needs a working `claude` binary and
  credentials. It must **not** run under `npm test` or `npm run lint`. Register it as
  its own `package.json` script, exactly like `scenarios:a7-integrity`.
- **Disposable everything.** Temp `$HOME` and `WIENERDOG_HOME`, removed in a `finally`.
  Never write the maintainer's real `~/.claude/CLAUDE.md` — this probe's entire subject
  is that file, so pointing it at the real one would both corrupt the measurement and
  edit the user's memory.
- **Record the environment with the finding.** The logbook entry must state the
  `claude --version` measured against, the date, the exact argv, and the raw
  per-case verdicts. A version-less finding is worthless three releases later — that is
  why Amendment 2 rejected pinning in the first place.
- **Report, do not decide — but the report now gates.** If the answer is "loaded", do
  not change `composeClaudeArgs`, do not add `--bare`, and do not alter the profile in
  **this** WP. Write the finding, then fill in `WP-hermetic-user-memory-suppression`'s
  Current-state placeholder with the measured fact and flip that spec to the owner for
  scheduling. **This WP is Done once the measurement is recorded** — under either
  verdict; it never waits on its own descendant (that was the round-2 cycle finding R6
  removed). The gate that stops the chain lives on the consumer:
  `WP-managed-block-by-reference` proceeds only when this WP is Done **and** the verdict
  is *not loaded* **or** the suppression WP is Done.
- Skip cleanly with a clear message (exit 0, "skipped: no `claude` on PATH") when the
  binary or credentials are absent, so a contributor without them is not blocked.
- When uncertain: choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope.

## Security checklist

- [ ] The canary token is a fresh random value per run, generated with
      `crypto.randomBytes`, never a fixed string — a fixed token could match unrelated
      output and produce a false "loaded".
- [ ] The temp `$HOME` path is built with `fs.mkdtempSync` inside the OS temp dir; no
      untrusted identifier flows into it.
- [ ] The probe must never point `HOME` or `WIENERDOG_HOME` at the real user's
      directories, and must assert that invariant before spawning.
- [ ] The model's reply is searched for the token with a plain string `includes`, never
      a regex built from output.
- [ ] Case D writes an import line pointing at a path inside the temp tree only. Do not
      probe missing-target behaviour with a path outside it.
- [ ] The `finally` cleanup must run even when the spawn throws, and must refuse to
      delete a path it did not create.

## Acceptance criteria

- [ ] AC-1 — The probe composes its argv via the real `getProfile('dream')` +
      `composeClaudeArgs` and prints that argv in its output.
- [ ] AC-2 — Cases A, B, C, D each run and report an explicit `loaded` boolean plus the
      raw evidence.
- [ ] AC-3 — The non-vacuity control (token in the prompt) reports `loaded: true`; the
      run **fails** if it does not.
- [ ] AC-4 — Case D reports no crash and no error output — a missing import target
      degrades silently.
- [ ] AC-5 — The probe skips with exit 0 and a clear message when `claude` is absent.
- [ ] AC-6 — Temp `$HOME` and `WIENERDOG_HOME` are removed after the run, including on
      failure.
- [ ] AC-7 — `npm test` and `npm run lint` do not invoke the probe.
- [ ] AC-8 — `docs/specs/logbook/2026-08-30-hermetic-user-memory-canary.md` exists and
      states: the `claude --version`, the date, the argv, the five verdicts, and one
      sentence on what it means for ADR-0025 and ADR-0039 §2.
- [ ] AC-9 — **The gate is honoured (round-2 finding F4).** If case A reports
      **loaded**, `WP-hermetic-user-memory-suppression`'s Current-state placeholder is
      filled in with the measured fact **in this same PR** — that is this WP's whole
      obligation to the adverse branch, and it is what lets this WP reach Done without
      waiting on its own descendant. If case A reports **not loaded**, say so explicitly
      in the PR body and in the logbook entry, and close the suppression WP as
      `Superseded` with a one-line pointer to the logbook entry.

## Verification steps (run these; paste output in the PR)

```bash
npm run scenarios:memory-canary
npm test
npm run lint
# AC-7 — the probe is not wired into the default gates (expect NO output):
grep -n "memory-canary" tests/run.js scripts/lint.js
# AC-1 — the real composer is used, not a hand-written argv:
grep -n "composeClaudeArgs\|getProfile" tests/scenarios/memory-canary/run-memory-canary.js
```

## Out of scope (do NOT do these)

- Changing `composeClaudeArgs`, any runtime profile, or the hermetic argv — even if
  the finding is "loaded". That is `WP-hermetic-user-memory-suppression`'s job. Report,
  fill in its Current-state placeholder, and let the owner schedule it.
- Changing the managed block or the adapters — that is
  `WP-managed-block-by-reference`, which this WP gates.
- Amending ADR-0025 — propose it in the PR body; the amendment is the owner's call
  once the finding is in.
- Opening any capability gate. `wienerdog safety` stays as it is.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `test(scenarios): hermetic user-memory canary (WP-memory-import-hermetic-canary)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Revision log

- **2026-08-30 — created** from the ADR-0039 chain (round 1).
- **2026-08-30 — Codex round-2 finding F4 (owner: ACCEPTED).** Round 1 wrote this as a
  pure measurement — "report, do not decide" — with no consequence attached to an
  adverse verdict. A canary whose bad outcome changes nothing is not a gate, and
  `WP-managed-block-by-reference` would have shipped over an unresolved finding while
  formally "depending on" this WP. Changes: the **loaded** verdict is now blocking; Done
  criteria became **disjunctive** (*not loaded, recorded* / *loaded, and the suppression
  WP merged*); the adverse branch spawns `WP-hermetic-user-memory-suppression`, whose
  Current-state placeholder this WP fills in with the measured fact; new **AC-9** pins
  the gate. The "report, do not decide" discipline still governs this WP's own code —
  what changed is that the report now stops the chain instead of annotating it.
- **2026-08-30 — Codex round-2 finding R6 (owner: ACCEPTED).** Round 2 created a
  **dependency cycle**: this WP's Done criteria required
  `WP-hermetic-user-memory-suppression` to be merged, while that WP `depends_on` this
  one — neither could ever start. Fixed by moving the conditional onto the **consumer**:
  this WP is Done once the measurement is recorded under either verdict (plus, on the
  adverse branch, filling in the successor's Current-state placeholder), and
  `WP-managed-block-by-reference`'s Blocked-by row carries the disjunction. Same gate,
  no cycle. AC-9 reworded accordingly. **From the round-3 AC-to-Deliverables consistency
  pass:** AC-9 requires editing `WP-hermetic-user-memory-suppression.md`, which was not
  in the Deliverables — an unsatisfiable criterion under the permission boundary. Added.
- **2026-08-30 — Codex round-3 finding S7 (owner: ACCEPTED).** A pre-R6 sentence survived
  in the implementation notes — "This WP is not Done until that successor is merged" —
  contradicting the Context table R6 had already corrected. Purged; the notes now state
  the R6 rule (Done on the recorded measurement, either verdict) and point at the consumer
  that carries the gate. A repo-wide grep for the other pre-R6 phrasings found no further
  occurrences.
