---
date: 2026-09-05
title: WP-audit-d-code-derived-recipients — design gate rounds
related_wps: [WP-audit-d-code-derived-recipients]
---

# WP-audit-d-code-derived-recipients — design gate rounds

## Round zero — architect, 2026-09-05, tree at `8c52808f`

Base: worktree `/Users/gyulafeher/Documents/Claude_Projects/wienerdog-wt/audit-d-design`,
branch `docs/wp-audit-d-code-derived-recipients`, `HEAD = 8c52808f = origin/main`.
Every measurement below was taken against that SHA. The stub the package matured
from carried citations measured on 2026-08-05 (tree `45f01d1`); all of them were
re-measured here and are recorded as file:line at `8c52808f`.

### Baselines actually run

**Suite** — `node tests/with-temp-root.js tests/run.js`, exit 0:

```text
ℹ tests 2630
ℹ suites 0
ℹ pass 2618
ℹ fail 0
ℹ cancelled 0
ℹ skipped 12
ℹ todo 0
ℹ duration_ms 50113.092375
```

**Lint** — `npm run lint`, exit 0 (run twice: once as the baseline, once after the
spec was written — both clean; the second run caught and then cleared one MD038):

```text
markdownlint-cli2 v0.23.0 (markdownlint v0.41.0)
Linting: 640 file(s)
Summary: 0 error(s)
--- shellcheck ---
--- PSScriptAnalyzer ---
--- frontmatter check ---
frontmatter check passed: 268 spec(s), 4 agent(s)
lint passed
```

**RED proofs** — `node scripts/red-proofs.js`, exit 0. Run on a `git archive`
scratch copy under the scratchpad with a copied `node_modules`, because the
worktree's `node_modules` is a symlink and `npm run red-proofs` refuses one:

```text
RED proofs — root .../scratchpad/rp-base
37 declared proof(s), 37 selected
PROVEN       dot-segment-admit-reverted  (WP-dot-segment-denial criterion 1)
… 37 rows, every one PROVEN …
PROVEN       WP-quarantine-preserve-durability criterion 7 — commit-clobbers-destination=PROVEN; …
```

### The defect, DRIVEN not argued

`registry.callTool('create_draft', …)` with a mocked Gmail client and a
`grantCheck` that always returns `false`. Script:
`…/scratchpad/drive-defect.js`. Output, verbatim:

```text
--- verb table facts ---
create_draft.capabilityClass = DRAFT
create_draft.inputSchema.properties.to = {"type":"string","maxLength":320,"pattern":"^[^\\r\\n]*$"}
create_draft.limits = {"maxCallsPerRun":10}
send_digest_to_self has a `to` property?  false
send_digest_to_self.limits = {"maxCallsPerRun":2}

--- the defect: model-named address, no grant ---
callTool returned: {"content":[{"type":"text","text":"{\"draftId\":\"d1\",\"messageId\":\"m1\"}"}]}
grantCheck consulted: 0 time(s)
drafts.create raw MIME decoded:
To: attacker@evil.example
Subject: exfil
Content-Type: text/plain; charset="UTF-8"

the vault says ...
getProfile called? false

--- pre-call-increment / no-refund on the counter ---
call 1 threw: broker verb create_draft failed
counter after a FAILED call: 1 (no refund)
```

So at `8c52808f`: an arbitrary model-named address reaches the draft's `To:`
header; the grant check is consulted **zero** times; and the 2026-08-05
pre-call-increment / no-refund fact **re-verifies** — a call that throws still
consumes a slot.

### The credential measurement that changed the design

`compositeServices` (`src/cli/gws-broker.js:53-82`) routes gmail methods per
capability class. Probed at `8c52808f` with fake per-class clients:

```text
DRAFT-only  -> getProfile? undefined | messages? undefined | drafts.create? function
READ+DRAFT  -> getProfile? function | messages.get? function | drafts.create? function | messages.send? undefined
```

`weekly-review` is DRAFT-only today (`runtime-profile.js:115`), and
`assembleRegistry` derives the classes to load from the profile's verbs alone
(`gws-broker.js:95`). A `create_draft_to_self` that calls `getProfile`, and a
`create_reply_draft` that calls `messages.get`, are therefore **unreachable** under
a DRAFT-only profile — they would have failed at call time behind the masked
`broker verb … failed` message. This is what produced the `extraClasses` field and
the `requiredClassesFor` helper, and it is Dispatch-precondition items 1 and 2.

### Consumer sweep (the stub deferred this to dispatch time; it ran here)

Two passes, every path literal: system `grep -rn` over
`src skills templates tests docs bin`, then a second repo-wide pass (excluding
`node_modules/` and `.git/`) that reaches the root files — which is where
`FIX-PLAN.md` was found; the first pass's scope does not include it. Both sweeps
read their targets — the output names files and line numbers, and no
`No such file` appeared on stderr. Every `create_draft` occurrence at `8c52808f`:

| Kind | Sites |
|---|---|
| Product code | `src/core/runtime-profile.js:103,:113,:115`; `src/gws/broker/verbs.js:154,:155` |
| Skills | `skills/wienerdog-inbox-triage/SKILL.md:13,:24,:33`; `skills/wienerdog-weekly-review/SKILL.md:13,:30,:35` |
| Live docs | `docs/GLOSSARY.md:36`; `docs/adr/0026-gws-capability-broker.md:152` |
| Tests | `tests/unit/broker-verbs.test.js` (5 sites); `broker-registry.test.js:38,:42,:50,:64,:68`; `broker-wiring.test.js:83,:84,:104,:107`; `routine-runtime.test.js:119`; `routines-skill-structure.test.js:147,:148` |
| Records (not rewritten) | `FIX-PLAN.md:525,:541`; `docs/specs/done/…`; `docs/security-audit/…` |
| **No hit** | `templates/`, `bin/`, `tests/scenarios/`, `tests/golden/`, `src/gws/gmail.js` beyond its single caller |

`gmail.draft` has exactly one PRODUCT caller (`verbs.js:171`) — the attended
`gws gmail draft` CLI that `docs/ARCHITECTURE.md:160` still describes no longer
reaches it. It has one further caller in the suite,
`tests/unit/gws-gmail.test.js:142` (corrected in the executor pass, below). `tests/scenarios/broker-e2e/` names no verb: `allowedMethodsFor`
(`run-broker-e2e.js:63-79`) derives permitted Google methods by regex over each
verb's `apiMethod`, and `gmail.users.getProfile` is exempt at `:256` — so the live
E2E harness needs no change, measured rather than assumed.

**Decision recorded: `create_draft` is DELETED, not merely de-allowlisted.** Zero
callers survive the split, and a record left in the frozen table is one allowlist
edit from reachable. The spec's criterion-1 universal is only true of the deleted
state (Dispatch-precondition item 3).

### Every citation re-measured (ranges checked at BOTH ends)

| Citation | Line content at `8c52808f` |
|---|---|
| `src/gws/broker/verbs.js:154` / `:172` | `create_draft: Object.freeze({` / `}),` |
| `verbs.js:165` / `:166` / `:167` / `:170` | the `to` / `subject` / `body` properties / `limits: { maxCallsPerRun: 10 },` |
| `verbs.js:21` | `const NO_CRLF = '^[^\\r\\n]*$';` |
| `verbs.js:52` | `max: { type: 'integer', min: 1, max: 20 },` (gmail_search) |
| `verbs.js:69` | `properties: { id: { type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } },` |
| `verbs.js:174` / `:206` | `send_digest_to_self: Object.freeze({` / `}),` |
| `verbs.js:181-183` / `:184-192` / `:193` / `:197-201` | zero-address comment / schema / `maxCallsPerRun: 2` / self-resolve + fail-loud |
| `src/gws/broker/registry.js:60-62` / `:69` / `:71` | service-absent refusal / `checkAndCount(…)` / the SEND-only grant gate |
| `src/gws/broker/limits.js:22` / `:28` | `function checkAndCount(state, verbName, limits) {` / `}` |
| `src/gws/gmail.js:18` / `:23` | `function assertHeaderSafe(value, field) {` / `}` |
| `gmail.js:31` / `:35` | `function header(headers, name) {` / `}` |
| `gmail.js:106` / `:123` | `async function read(services, opts) {` / `}` |
| `gmail.js:131` / `:142` | `async function draft(services, opts) {` / `}` |
| `gmail.js:150` / `:160` / `:162` | `function buildMime(m) {` / `}` / `module.exports = { search, read, draft, buildMime };` |
| `src/gws/scope-sets.js:24` | the DRAFT set — `gmail.compose` (the stub had no citation here; **:25 is SEND**, corrected) |
| `src/cli/gws-broker.js:53` / `:82` | `function compositeServices(byClass) {` / `}` |
| `gws-broker.js:63-70` / `:76-79` / `:95` / `:121-128` / `:167-170` | READ routing incl. getProfile / DRAFT routing / class derivation / class-unavailable refusal / the `compositeServices` export + its reason |
| `src/core/runtime-profile.js:103` / `:113` / `:115` | inbox-triage verbs / the comment / weekly-review verbs |
| `skills/wienerdog-inbox-triage/SKILL.md:13,:24,:33` | verb list / "call the `create_draft` tool with the sender as `to`" / "no send tool" |
| `skills/wienerdog-weekly-review/SKILL.md:13,:30,:35` | verb name / "with the user's own address as `to`" / "no send tool" |
| `docs/GLOSSARY.md:36` | broker-verb definition, `create_draft` in the example list |
| `docs/THREAT-MODEL.md:138` / `:140` / `:142` | T4a mitigations / the A12 residual / the 0.10.0 paragraph — `:140` and `:142` both say "name a new recipient" |
| `docs/adr/0026-gws-capability-broker.md:152-153` / `:200` / `:240-247` / `:475-520` | §2 draft bullet / D-SEND-SCOPE / §4 / Amendment 1 |
| `tests/scenarios/broker-e2e/run-broker-e2e.js:63` / `:79` / `:256` | `function allowedMethodsFor(profileId) {` / its closing `}` (`:78` is `return allowed;`) / the getProfile exemption |

**Stub citations that moved or were wrong**, all corrected in the matured spec:
the stub's `verbs.js:154/:165/:170` survived unchanged; `registry.js:71` survived;
`registry.js:69` survived; the stub's SKILL.md line numbers (weekly-review `:30`,
inbox-triage `:24`) survived. Nothing rotted between `45f01d1` and `8c52808f` —
but the ranges are now recorded at both ends, which the stub did not do.

### Template conformance diff (`docs/specs/_TEMPLATE.md`)

| Template section | In the spec |
|---|---|
| frontmatter (`id, title, status, model, size, depends_on, adrs, epic`) | present; `size: M`, `status: Draft`, `epic: audit-close`, `adrs: [ADR-0004, ADR-0026, ADR-0031]` |
| `## Context (read this, nothing else)` | present |
| `## Current state` | present |
| `## Deliverables (permission boundary — touch ONLY these)` | present, 15 rows |
| `### Exact contracts` | present |
| `## Contract reference` | present — the 2-of-7 trigger fires on (i), (iii), (vi), (vii), stated in place |
| `### Contract table(s)` | present — Tables A, B, C |
| `### Mirrored Surface Checklist` | present, 11 registered mirrors |
| `## Implementation notes & constraints` | present |
| `## Security checklist` | present; the template's path/shell checkbox is marked `N/A — <reason>` in place, two applicable items added |
| `## Acceptance criteria` | present, 11 numbered; the template's idempotence item is criterion 11, marked `N/A — <reason>` |
| `## Verification steps` | present, V1–V5 |
| `## Out of scope (do NOT do these)` | present |
| `## Definition of done` | present, all five items |
| *(extra)* `## Dispatch precondition — owner items` | present, 7 items — not a template section; the shape the current pipeline expects (`docs/specs/done/WP-quarantine-preserve-durability.md`) |

No template section is silently absent.

### Internal coherence pass — findings and dispositions

| # | Finding | Disposition |
|---|---|---|
| CF1 | **V5 as first drafted was over-strict** — it flagged `calendar_list.from` and `calendar_list.to`, which are ISO timestamps, so the hand-built COMPLIANT state went RED. A gate that punishes correct work. | **fix** — narrowed to `v.service === 'gmail'`, plus a non-vacuity guard that refuses when zero gmail verbs are found. Re-observed in all three states (below). |
| CF2 | **The DRAFT-only credential blocker** (measured above): both new verbs need READ-routed methods, and `weekly-review` loads DRAFT only. The naive split would have shipped a verb that always fails. | **fix** — `extraClasses` on the verb record + `requiredClassesFor` in `verbs.js`; parked as owner items 1 and 2. |
| CF3 | **Criterion 8 had product behaviour but no testable seam** — `assembleRegistry` is not exported from `src/cli/gws-broker.js`, so nothing could carry a RED proof. | **fix** — `requiredClassesFor` is defined and exported from `verbs.js` (a pure function over the verb table), which also keeps identity `[AUD-D6]` in the single declared suite. Table C moved 5→6 identities, 8→9 declarations, and its own count sentence was updated in the same edit. |
| CF4 | A naive `grep create_draft` for V4 also matches `create_draft_to_self`, so the check would never go green. | **fix** — the pattern requires a non-word character after the name: `create_draft($\|[^_A-Za-z0-9])`. Verified: zero hits on the COMPLIANT tree. |
| CF5 | V4's file list first included `docs/adr/0026-…` and `docs/THREAT-MODEL.md`; Amendment 2 legitimately names the deleted verb, so the check would have failed on correct work. | **fix** — the list is live product surfaces only (six paths), and the excluded record set is named in the verification block itself, so the universal carries its exception set in place. |
| CF6 | Two Table A cells used nested code spans (backticks inside a code span) and would not render. | **fix** |
| CF7 | markdownlint MD038 on `` `Re: ` `` (space inside a code span). | **fix** — reworded; `npm run lint` clean afterwards. |
| CF8 | V3's baseline note conflated the whole-tree `37 declared / 37 PROVEN` with this WP's own selection, which is `0 selected` until the implementer writes the declarations. | **fix** — both runs are now listed, with the absent-state VACUOUS red quoted. |
| CF9 | `docs/THREAT-MODEL.md:140` and `:142` both assert a hijacked model "cannot … name a new recipient". **False today for drafts.** | **residual until merge** — parked as owner item 6; the spec states that neither sentence needs editing because this WP is what makes them true, and the drafts sentence lands at `:138` with the code. |
| CF10 | `docs/ARCHITECTURE.md:160` still describes an attended `gws gmail draft` CLI surface; `gmail.draft` has one caller (`verbs.js:171`) and it is the broker verb. | **drop** — stale independently of this WP; routed to the PR's "Discovered issues", listed in Out of scope. |
| CF11 | `FIX-PLAN.md:525,:541` (`ST2` / `N-R2`) record exactly the residual this WP closes. | **drop** — a dated design-of-record is not rewritten when the thing it recorded changes; named in Out of scope with that reason. |
| CF12 | Table A first listed only the gmail verbs, so criterion 1's universal ("no verb…") quantified over nothing named. | **fix** — all nine live rows are in Table A, plus a struck row for the deleted verb. |

### Acceptance criteria and verification steps — RUN on the pinned base

| Item | Runnable at `8c52808f`? | Result / exit |
|---|---|---|
| V1 `node tests/with-temp-root.js tests/run.js` | yes | **0** — 2630/2618/0/12 (output above) |
| V2 `npm run lint` | yes | **0** |
| V3 `node scripts/red-proofs.js` (whole tree) | yes | **0** — 37 declared, 37 selected, all PROVEN |
| V3 `node scripts/red-proofs.js --wp WP-audit-d-code-derived-recipients` | yes | **1** — `VACUOUS: V2 — the selection matched no proof` (the deliverable-absent red) |
| V4 presence guard + sweep | yes | see the three-state table below |
| V5 address-field universal | yes | see the three-state table below |
| C1 (verb table / no address field) | partly — V5 covers the address half | **RED** at base: `create_draft.to` |
| C2–C6 (both verbs' behaviour) | no — they assert behaviour of code this WP creates; no runnable form exists on the pinned base | not run; recorded as not-yet-runnable |
| C7 (DRAFT never grant-gated) | no — same reason | not run |
| C8 (`requiredClassesFor`) | no — the helper does not exist yet | not run |
| C9 (`--allowedTools` strings) | yes | **RED**, and it discriminates — output below |
| C10 (all Table C declarations PROVEN) | no — declarations do not exist yet; the harness's own refusal is V3's selection row above | not run |
| C11 idempotence | `N/A` | — |

C9 on the pinned base, exit 1:

```text
FAIL inbox-triage
     got:      mcp__wienerdog-broker__gmail_search,mcp__wienerdog-broker__gmail_read,mcp__wienerdog-broker__create_draft
     expected: mcp__wienerdog-broker__gmail_search,mcp__wienerdog-broker__gmail_read,mcp__wienerdog-broker__create_reply_draft
FAIL weekly-review
     got:      mcp__wienerdog-broker__create_draft
     expected: mcp__wienerdog-broker__create_draft_to_self
```

This also confirms the exact strings criterion 9 pins are the ones
`composeClaudeArgs` really produces — the prefix and separator are observed, not
predicted.

### The two NEW verification steps, observed in all three states

Three scratch trees were built from `git archive HEAD`:
**ABSENT** (`src/gws/broker/verbs.js` and `skills/wienerdog-weekly-review/SKILL.md`
deleted), **COMPLIANT** (the verb split and every mirror hand-applied),
**VIOLATING** (compliant, plus a `to` property re-added to `create_draft_to_self`
and one `create_draft` mention restored in a `SKILL.md`).

| State | V4 presence guard | V4 sweep | V5 |
|---|---|---|---|
| Pinned base `8c52808f` | exit **0**, six paths listed | exit **0** — 12 hits (RED) | exit **1** — `create_draft.to` (RED) |
| **Deliverable ABSENT** | exit **1** — `ls` names both missing files (RED) | exit **2** — `grep: … No such file or directory` on stderr; a negated form would have read GREEN here (RED) | exit **1** — `require` throws (RED) |
| **COMPLIANT** | exit **0** | exit **1**, zero output (GREEN) | exit **0** — `V5 OK: no gmail verb input schema declares an address field (5 gmail verbs of 9 checked)` (GREEN) |
| **VIOLATING** | exit **0** | exit **0** — one hit, `skills/wienerdog-inbox-triage/SKILL.md:24`, the restored `create_draft` mention (RED) | exit **1** — `create_draft_to_self.to` (RED) |

The ABSENT column is why V4 leads with `ls -1` rather than a negated grep: with the
file gone, `grep` exits 2 and any `! grep -q` form would have reported success
exactly where the work was never done.

The over-strictness caught by CF1 is the other half of the both-directions rule:
V5's first draft was RED on the COMPLIANT tree
(`address-bearing verb input(s): calendar_list.from, calendar_list.to`) and would
have punished a correct implementation. It never reached the spec.

### Owner items parked (the spec's Dispatch precondition)

Each carries a recommendation; the session may dispatch under them (standing
instruction, `docs/specs/logbook/2026-09-05-owner-rulings-durability-queue.md`).

1. `weekly-review`'s broker gains the READ credential — **recommend yes**; the
   model's reachable surface is unchanged. Overruling leaves only item 2.
2. Keep or drop weekly-review's email draft — **recommend keep**. Overruling
   deletes `create_draft_to_self`, makes the routine `mcp:'empty'`, and costs the
   user the emailed weekly review.
3. Delete `create_draft` vs. de-allowlist it — **recommend delete**. Overruling
   makes V5 unsatisfiable and the title claim false.
4. `Reply-To` before `From` — **recommend yes**; the residual is identical either
   way. Overruling breaks list/aliased mail for no gain.
5. Caps 3 and 10, movers named in Table A — **recommend as written**. Overruling to
   1 loses the week's draft to a single transient error (measured no-refund).
6. T4a's "cannot name a new recipient" is false today — **recommend no separate
   patch**; it lands with the code. Overruling costs an interim commit and a
   rewrite.
7. Table B's address rule is narrower than RFC 5322 — **recommend accept the
   narrowing**. Overruling admits addresses the broker cannot reason about on the
   one field an attacker fully controls.

### STOP CRITERION for the external loop — pinned BEFORE round 1

**The loop closes** when one full round returns **no product finding on either
channel** (Codex plugin adversarial review and the hermetic Codex shadow) —
"product" per Weighted closure: `src/` behaviour, the ADR contract, or anything a
user or a consuming model observes. Machinery findings still open at that point are
fixed within the existing surface or accepted as named residuals in the spec; they
do **not** extend the loop, and verification machinery may grow only to guard a
product behaviour, in the smallest form that guards it.

**Escalation, both directions:**

- **(i) Repeat-kind → extraction, never a third patch.** If two consecutive rounds
  land findings on the *same* contract family — the verb table (Table A), the
  reply derivation (Table B), or the RED proofs (Table C) — the next step is an
  ADR-0031 contract-extraction pass on that family, not another textual fix: pull
  the scattered facts into the canonical table, update every registered mirror, and
  register any newly-found mirror in the same pass. Then resume.
- **(ii) Owner-boundary findings PARK, they do not get folded.** A finding whose
  only honest fix would change an owner-ruled value (the caps in Table A), add a
  grant, widen a `brokerVerbs` allowlist or an OAuth scope set, or reopen a
  rejected alternative (mandatory-self; gating DRAFT behind a grant) is recorded as
  a new Dispatch-precondition item with a recommendation and its overrule cost —
  never folded into the spec silently. Diff size does not measure contract impact.
- **(iii) Scope objections.** The focus text states the package's boundaries up
  front (no grant is added, no scope changes, `send_digest_to_self` and the E2E
  harness are out of scope, and the reply-recipient residual is accepted by
  ruling). A reviewer disagreeing with a boundary files it as a scope objection in
  the routed section rather than counting it toward the verdict.

Raw reviewer output is committed **before** adjudication, and each round's row here
cites the raw file's path **and the SHA of the commit that introduced it**.

## Round zero — orchestrator executors, 2026-09-05, on `4c968eeb`

Two clean-context executors ran on the round-zero tip, each given only the
artifacts and the reference document.

**Template conformance: CONFORMS.** No blocking item; no template section
silently absent.

**Internal coherence (clean context): 8 findings, all machinery/wording — LIGHT
under Weighted closure, so they folded into the tip before external round 1
rather than opening a round.** Everything else the executor checked reproduced:
~50 citations at both ends, the `compositeServices` DRAFT-only / READ+DRAFT block,
the attacker-draft demonstration with `grantCheck` consulted 0 times, the
no-refund counter, V1 2630/2618/0/12, V2 exit 0, V3 `--wp` correctly RED
(`VACUOUS: the selection matched no proof`), V4 sweep RED (13 hits — the
executor's count includes the spec's own text, which the six-path V4 list
excludes), V5 RED (`create_draft.to`). **No product finding; the stop criterion is
untouched, and no owner item or Table A/B value moved in this pass.**

| # | Finding | Disposition |
|---|---|---|
| E1 | Deliverables row for `tests/unit/broker-verbs.test.js` said "the five new identities of Table C"; Table C has six. | **fix** — the cell no longer predicts a count: it says "every test identity named in **Table C**", and also records the verb-table pin moving eight names → nine. |
| E2 | Deliverables row for the `.proofs.json` said "the eight declarations of Table C"; Table C has nine rows. | **fix** — same treatment: "one declaration per **Table C** row", plus the `suite` value the file must carry. Both cells were re-read whole afterwards; neither predicts any other Table C content. |
| E3 | `allowedMethodsFor` cited as `run-broker-e2e.js:63-78`; the closing brace is `:79` (`:78` is `return allowed;`). | **fix** — both spec sites and the logbook citation row corrected to `:63-79`. |
| E4 | "`gmail.draft` has exactly one caller in the tree" is false — `tests/unit/gws-gmail.test.js:142` calls it directly. | **fix** — the universal narrows to one PRODUCT caller and names the unit-test caller as its exception. **Measured, not assumed:** the additive `buildMime`/`draft` extension was applied to a scratch copy and `tests/unit/gws-gmail.test.js` passed **9/9 unchanged** (with `inReplyTo`/`references`/`threadId` absent the bytes and request body are identical), so that file stays OUT of Deliverables. |
| E5 | The sweep's stated scope (`src skills templates tests docs bin`) does not reach `FIX-PLAN.md`, which it nonetheless cites. | **fix** — both the spec and this record now state the two passes and say which one found the root file. |
| E6 | **The one finding with teeth.** Table C's `reply-fetch-failure-drafts-anyway` mutation ("continue with an empty header set") lands on Table B's own "both empty → refuse", producing the SAME zero-draft observable as correct code — `evaluateRed`'s equality would have made it a vacuous proof. | **fix** — restated so the mutant DRAFTS (a literal fallback recipient and subject). The other eight rows were re-checked for the same shape: all produce a different observable, but two carry a masking trap, now named in the spec — `reply-address-pattern-dropped` needs a candidate that fails the pattern **without** CR/LF, and `reply-recipient-not-derived` needs a `body` address **different** from the header's. A general sentence stating the requirement was added above them. |
| E7 | "Criteria 1, 7, 9 and 11 carry no declaration" omits criterion 10. | **fix** (not left) — 10 is added with its reason: it is the meta-check over Table C and cannot declare a proof of itself; V3 is its check. |
| E8 | Mirrored Surface Checklist said "the four test rows" without naming them. | **fix** — the four verb-name-pinning test files are spelled out. |

## Round 1 — external double channel, 2026-09-05, on `f1db2f12`

Both channels returned **needs-attention** with **zero scope objections** — the
boundaries stated up front (no grant, no scope change, `send_digest_to_self` and
the E2E harness out of scope, the reply-recipient residual accepted by ruling)
were not contested by either reviewer. Every finding was reproduced by execution
before adjudication, and the raws were committed **before** anyone read them:

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round1-codex-plugin.txt` | `6ca9f75f` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round1-herdr-shadow.txt` | `c8222247` |

Five findings, **all FIX, all HEAVY** — Table B, criterion 8 and V5 are product and
gate contracts, so the fixes change what the implementer builds.

| # | Channel(s) | Band | Finding | Disposition — what changed |
|---|---|---|---|---|
| **R1-A** | plugin high/A **+** shadow A — **CONVERGED** | HEAVY | Table B's "harvest the `<…>` groups" candidate extraction is wrong three ways: `alice@example.org (backup <old@example.net>)` selects the **comment's** address; `victim@example.com, Attacker <attacker@example.com>` yields ONE candidate — the bracketed one — silently dropping the bare mailbox, so criterion 4's exactly-one refusal never fires; and the valid `"Team <east>" <alice@example.org>` is refused. | **fix** — extraction and count rows replaced by an **anchored whole-value single-mailbox grammar**: the entire trimmed header value must match `^(ADDR)$` or `^(?:(?:<quoted-string>\|<plain atoms>)[ \t]+)?<[ \t]*(ADDR)[ \t]*>$`, nothing after the `>`. A grammar anchored over the whole value cannot ignore part of it, which is the property harvesting lacked. The four refused families are now stated in Table B, in criterion 4, and in the `[AUD-D3]` identity name; criterion 3 and the `[AUD-D2]` identity name carry the accepted forms (bare, plain display name, quoted display name containing `<`/`,`, `Reply-To` precedence). |
| **R1-B** | plugin medium/B | HEAVY | The round-0 pattern `^[^\s<>,;:"\\]+@[^\s<>,;:"\\]+\.[^\s<>,;:"\\]+$` **accepts** `user@[192.0.2.1]` and `alice@relay@example.org`, while the prose and owner item 7 both claim address literals are refused. | **fix** — `ADDR` now excludes `@`, `[` and `]` from both sides, so exactly-one-`@` is structural and an address literal cannot match; both cases are named as required `[AUD-D3]` fixtures. **Owner item 7's RECOMMENDATION stands unchanged — only its premise was misstated**, and the spec now says so in place. |
| **R1-C** | plugin high/A **+** shadow A — **CONVERGED** | HEAVY | `extra-classes-dropped` mutates only `requiredClassesFor`; both production consumers (`gws-broker.js:95` derivation, `:121-128` pre-dispatch refusal) can stay on the old single-class derivation with `[AUD-D6]` still PROVEN. The plugin reproduced in memory that with DRAFT unavailable, `getProfile` ran and the model saw the masked `broker verb … failed` instead of the fixed class-unavailable refusal. | **fix** — criterion 8 now drives the **real** `assembleRegistry` for **both** new verbs in **three** credential states (READ missing / DRAFT missing / both present), asserting the exact fixed sentence and **zero** Google calls on a missing class, and the handler reached when both load. Seam chosen: **injected credential loading** (`assembleRegistry(paths, profile, deps)` with `deps.loadServices`, exported beside `compositeServices`) over an exported pure "assembly plan" — a pure plan is one more API a consumer can simply stop calling, which is the exact failure this finding is. `[AUD-D6]` moves to `tests/unit/gws-broker.test.js` (which already drives that file, `:12,:34,:54`), and Table C gains **two** more mutations, one per consumer site. **Table C now spans two suites, so two declaration files** — its "one suite" sentence and both Deliverables rows changed with it. |
| **R1-D** | plugin medium/B | HEAVY | The residual's provenance claim "the recipient must already have mailed the user" is **false** under `Reply-To` precedence: `From: attacker` with `Reply-To: third-party@example.net` addresses someone who never wrote. | **fix** — swept as a CLAIM, whitespace-flattened, not as a wording: three sites carried it (Context's "Named residual", the T4a paragraph quoted in Exact contracts, and Table A's cap-10 rationale). All three now say the recipient is **nominated by the selected message's author** (`Reply-To`, else `From`) and **may be an unrelated third party**; what is bounded is that the model cannot choose it. Re-swept afterwards: zero hits. **Owner item 4's recommendation (Reply-To first) is unchanged.** **CORRECTION 2026-09-05 (round 2, finding R2-D): the "zero hits" claim in this row was FALSE.** The T4a paragraph still contained "the recipient must already have mailed the user — but …"; the round-1 sweep pattern was built around the wording the same pass had just rewritten, so it could not see the clause it had left standing. Closed in the round-2 pass by deleting the clause and re-reading the whole cell. |
| **R1-E** | shadow A | HEAVY | V5 was a **denylist**: the shadow executed a synthetic schema declaring `destination` and V5 exited **0**. It also selected its set through the mutable `service` field, so a reclassified verb drops out of the check entirely. | **fix** — V5 now enumerates the intended shape instead of the forbidden one: it pins the exact nine-name verb table, the exact five gmail-service names, and for each of those five its `service`, `additionalProperties: false`, and its **exact** input property set from Table A. Criterion 1's universal quantifies over that asserted set. This is the repo's own lesson — enumerating your OWN GOOD is closable, enumerating the BAD is not — and V5 has now been wrong twice in exactly the two ways a one-directional run cannot see. |

### R1-A / R1-B validated by EXECUTION, not by reading

The grammar was run against 21 cases, side by side with the round-0 rule, before it
entered the spec. Exit 0, 21/21 as intended; **7 rows CHANGED**, and every change is
a round-1 defect closing:

```text
result   | new                  | old (round 0)        | input
ok       | alice@example.org    | null                 | "\"Team <east>\" <alice@example.org>" <-- CHANGED
ok       | null                 | old@example.net      | "alice@example.org (backup <old@example.net>)" <-- CHANGED
ok       | null                 | old@example.net      | "alice@example.org (backup <old@example.net>" <-- CHANGED
ok       | null                 | attacker@example.com | "victim@example.com, Attacker <attacker@example.com>" <-- CHANGED
ok       | null                 | attacker@example.com | "Attacker <attacker@example.com> more" <-- CHANGED
ok       | null                 | user@[192.0.2.1]     | "user@[192.0.2.1]" <-- CHANGED
ok       | null                 | alice@relay@example.org | "alice@relay@example.org" <-- CHANGED

21 cases, 0 mismatch(es)
```

Unchanged and still correct: bare addr-spec, `<addr>`, plain display name, quoted
display name containing a comma, punctuation in a display name, surrounding
whitespace, multiple bracketed mailboxes, two bare mailboxes, groups, trailing text
on a bare value, `user@localhost`, the empty value, and a CR/LF smuggling attempt
(refused by the grammar **before** `assertHeaderSafe` is reached).

### R1-E re-proved in four directions, the block taken VERBATIM from the spec

The V5 text was extracted from the spec's own fenced block and executed as written —
the escaping inside a single-quoted `node -e` is a gate-shape risk the repo has been
bitten by, so it was run rather than read.

```text
COMPLIANT        exit 0  V5 OK: 9 verbs, 5 with service===gmail, each with exactly Table A's
                         input properties and additionalProperties:false
MUTANT           exit 1  V5 FAIL: create_draft_to_self input properties are
 (`destination`)         ["body","destination","subject"], Table A says ["body","subject"]
PINNED BASE      exit 1  V5 FAIL: verb table is [… "create_draft" …], Table A is [… ];
 (create_draft)          service==='gmail' is [… "create_draft" …]; create_draft_to_self is absent;
                         create_reply_draft is absent
DELIVERABLE      exit 1  require of ./src/gws/broker/verbs.js throws
 ABSENT
```

The MUTANT column is the finding itself: that schema passed the round-1 V5 with
exit 0.

### STOP CRITERION — restated, because HEAVY fixes trigger a fresh round

Unchanged in substance from round zero, restated as the rule requires:

**The loop closes** when one full round returns **no product finding on either
channel** — product being `src/` behaviour, the ADR contract, or anything a user or
a consuming model observes. Machinery findings open at that point are fixed within
the existing surface or accepted as named residuals; they do not extend the loop,
and verification machinery grows only to guard a product behaviour, in the smallest
form that guards it. **All five round-1 findings were HEAVY, so round 2 is a full
fresh external round on both channels**, asked additionally to verify each round-1
fix is genuinely closed rather than re-worded.

**Escalation:**

- **(i) Repeat-kind → contract extraction, never a third patch. CIRCUIT-BREAKER
  WATCH IS ARMED ON TABLE B.** Round 1 landed **two** Table B findings (R1-A and
  R1-B) from **two** channels in a single round. Round 2 is therefore the second
  consecutive round in which a Table B finding would make this a repeat kind: **if
  round 2 lands any further Table B finding, that is escalation (i)** — the next
  step is an ADR-0031 contract-extraction pass on the recipient-derivation
  contract (pull every scattered fact into Table B, re-register every mirror), not
  another textual patch. Say so explicitly in that round's record.
- **(ii) Owner-boundary findings PARK.** A finding whose only honest fix would
  change an owner-ruled value (Table A's caps), add a grant, widen a `brokerVerbs`
  allowlist or an OAuth scope set, or reopen a rejected alternative
  (mandatory-self; gating DRAFT behind a grant) becomes a new
  Dispatch-precondition item with a recommendation and its overrule cost. **Round 1
  forced none**: item 7's premise was corrected while its recommendation stood, and
  item 4's recommendation is untouched by R1-D. **No new owner item; the list stays
  at seven.**
- **(iii) Scope objections** stay routed rather than counted. Round 1 produced
  zero.

## Round 2 — external double channel, 2026-09-05, on `0fbbb2c7`

Both channels **needs-attention**, **zero scope objections**, every claim
reproduced before adjudication. Raws committed pre-adjudication:

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round2-codex-plugin.txt` | `b2d987eb` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round2-herdr-shadow.txt` | `dda7aaaa` |

### ESCALATION (i) FIRED — this pass is a CONTRACT pass on Table B, not a third regex patch

Round 1 landed two Table B findings from both channels; round 2 landed three more
(quadratic backtracking — plugin A; valid single mailboxes refused — plugin B;
CR/LF erased before the refusal check — shadow A), so under ADR-0031 and the
pinned stop criterion the next step was a contract pass, and the durability loop's
precedent applies: **the breaker's answer is a contract ("an ORDER, not a
COVERAGE"), never a fourth fix.**

**What the contract turned out to be: an ORDER of operations over RAW header
values, with bounds BEFORE parsing.** Every one of the five Table B findings across
both rounds is the same defect wearing different clothes — *parsing before
bounding*. Unbounded input made the grammar's cost the attacker's choice; trimming
before the CR/LF check erased a leading or trailing `\r\n`; prefixing and
truncating the Subject to 512 erased a CR/LF sitting beyond character 512 and a
draft was created. A longer list of accepted and refused shapes could not have
fixed any of them, because none of them is about which shapes are accepted. Table B
is now eight ordered steps, each with its input and its invariant, with the
regexes demoted to **derived source forms** validated by an executed case table.
Step 0 (CR/LF on all five RAW values, untrimmed, before anything) settles both
CR/LF findings; step 2 (a 998-character bound before the grammar) settles the
cost finding by construction; step 7 keeps `assertHeaderSafe` as **defence in
depth**, explicitly not the check the contract relies on.

| # | Channel(s) | Band | Finding | Disposition |
|---|---|---|---|---|
| **R2-A** | plugin A | HEAVY | Quadratic backtracking in the round-1 regexes — **REPRODUCED on Node v25.9.0** by the orchestrator and, after the measurement defect below was found, here as well: doubling `n` quadruples the time, reaching 3 393 ms at n=32 000. | **fix, via the contract** — step 2 bounds the raw value at 998 *before* the grammar runs, so the cost is a constant on any engine: **3.24 ms per hostile header at the bound with the round-1 forms**, 0.0035 ms with the derived ones. The derived forms also remove both backtracking shapes (`DLABEL` excludes `.`, so the domain's dot structure is deterministic; `PHRASE`'s three alternatives start on disjoint characters, so the alternation never backtracks between them) — recorded as a true property of the derivation, explicitly not the thing the invariant rests on. |
| **R2-B** | plugin B | HEAVY | Valid single mailboxes refused: `"Alice"<alice@…>` (no whitespace before `<`) and `Alice "Team <east>" <alice@…>` (atom + quoted word). | **fix** — the grammar now states whitespace between words and before `<` as OPTIONAL, and `phrase = 1*word` with `word = atom / quoted-string`. Both are ACCEPTED fixtures in the executed case table and in criterion 3. |
| **R2-C** | plugin A | HEAVY | A READ **sibling** masks `extra-classes-dropped-derivation`: with `brokerVerbs: ['gmail_read', newVerb]` the old single-class derivation still loads READ and all six states pass. And the injected-deps cases never exercise the DEFAULT loader — an implementation that drops the fallback passes them while production calls `assembleRegistry` with no `deps`. | **fix** — criterion 8 now requires **SINGLETON** profiles (`brokerVerbs: [verb]`, one per new verb), an **instrumented** loader asserting the set of classes actually **REQUESTED** rather than only the dispatch outcome, and a separate pin that `assembleRegistry` with no `deps` resolves `loadServices` to `loadCredentialServices`. The `[AUD-D6]` identity name carries all three. |
| **R2-D** | plugin B **+** shadow B — **CONVERGED** | HEAVY | **R1-D was not closed.** Spec `:285` still read "the recipient must already have mailed the user — but …", and the round-1 record's "re-swept afterwards: zero hits" was false. | **fix** — the clause is deleted; the residual now states only author-nomination (`Reply-To` else `From`) and that the recipient may be a third party who never wrote. The round-1 row above carries a **dated correction line** rather than a silent rewrite. **Lesson, recorded:** the round-1 sweep pattern was built around the wording that same pass had just rewritten, so it was structurally blind to the clause it left standing — a sweep must be for the CLAIM, and after rewriting a cell the whole cell is re-read. This is the repo's existing intra-cell rule failing in the one place no mirror checklist can see. |
| **R2-E** | plugin A **+** shadow A — **CONVERGED** | HEAVY | V5 pinned **names only**, so weakened value schemas passed: dropping `id`'s `pattern` let `id = "attacker@example.net"` be forwarded as `to` and a draft was created (plugin countermodel); the shadow emptied every `required`, every property schema, every `capabilityClass` and every `extraClasses` and V5 still passed. | **fix** — V5 now compares the **COMPLETE canonical record** of each gmail verb against a literal derived from Table A: `capabilityClass`, `extraClasses`, `maxCallsPerRun`, `required`, `additionalProperties`, and every property's full schema including its `pattern`. Criterion 1 quantifies over that. Re-proved from the block extracted verbatim from the spec — green on compliant, red on **six** distinct weakenings plus the pinned base and the absent tree (table below). |
| **R2-F** | shadow B | HEAVY | Third masking trap on `reply-headers-unasserted`: a CR/LF in `To` or `Subject` is refused **identically** by correct and mutant code, because `buildMime` still asserts those two; only `Message-ID`/`In-Reply-To` or `References` discriminate. | **fix** — the third trap is named beneath Table C, and criterion 6 now requires injection **one field at a time** across all five raw fields, asserting zero `drafts.create` per case. |
| **R2-G** | plugin (follow-through) | HEAVY | (i) `reply-recipient-not-derived` was stated "in `replyTarget`, use the first address in the caller-supplied `body`" — but `replyTarget`'s only input is `id`, so the mutation cannot live there. (ii) A naive first-angle-candidate mutation also reddens `[AUD-D2]`'s quoted-display-name row, so its failing set exceeds `[AUD-D3]`. | **fix** — (i) the mutation is restated at the `create_reply_draft` **handler**, where `args.body` is in scope. (ii) Table C now states that `expectRed` sets are **MEASURED after implementation, never predicted**, and that a mutation whose measured set exceeds its declaration is **restated, not widened into the declaration** — widening would make the pair stop distinguishing the identities, which is why `evaluateRed`'s comparison is two-sided. |

### Table B validated by EXECUTION — as the ORDERED PIPELINE, not as a regex

39 cases, run through the full step-0 → step-6 order before the table entered the
spec. **Exit 0, 0 mismatches.** Every refusal is attributed to the step that made
it, which is the property a regex-only harness cannot show:

```text
ok   refuse:step0-crlf              R2 plugin: LEADING CR/LF — trim would have erased it
ok   refuse:step0-crlf              R2 plugin: TRAILING CR/LF — trim would have erased it
ok   refuse:step0-crlf              R2 shadow: CR/LF in Subject BEYOND char 512 — truncation would have ERASED it
ok   refuse:step0-crlf              CR/LF in the NON-selected-by-default header still refuses (step 0 reads all five)
ok   refuse:step2-raw-over-998      999 raw chars — one over the pre-parse bound
ok   refuse:step3-not-one-mailbox   R1-A: comment — old rule picked the COMMENT address
ok   refuse:step3-not-one-mailbox   R1-A: mixed bare+angle — old rule DROPPED the bare mailbox
ok   refuse:step3-not-one-mailbox   R1-B: address literal   /   R1-B: two @   /   quoted local part
ok   refuse:step4-addr-over-320     captured address over 320 (step 4)
ok   alice@example.org              R2 plugin: NO whitespace before < — was wrongly REFUSED
ok   alice@example.org              R2 plugin: atom + quoted word — was wrongly REFUSED
ok   alice@example.org              exactly 998 raw chars — the bound is inclusive
ok   third@example.net              Reply-To precedence (the residual: a third party who never wrote)

39 cases, 0 mismatch(es)
```

**Worst-case match time AT the 998 bound.** Eleven adversarial shapes, each built
to be **exactly 998 characters INCLUDING its failing tail** — an earlier attempt
truncated the tail to reach the length, which destroys the shape and understates
every number. Min of 50 runs after warmup, Node v25.9.0:

```text
shape                                  r1:bare  r1:mbox   r2:bare   r2:mbox   (ms)
A       'a@' + '.'*n + '!,'              0.712    0.000    0.0001    0.0001
A angle '<a@' + '.'*n + '!,>'            0.000    3.237    0.0000    0.0000
B       'a@' + 'b.'*n + '!,'             0.355    0.000    0.0023    0.0000
dots + atom tail                         0.710    0.000    0.0000    0.0000
angle + dots + atom tail                 0.000    3.231    0.0000    0.0000
phrase run, no '<'                       0.001    0.001    0.0015    0.0029
phrase+space run, no '<'                 0.000    0.005    0.0000    0.0035
phrase then unclosed '<'                 0.001    0.001    0.0006    0.0021
unterminated quoted                      0.000    0.003    0.0000    0.0025
quoted words then no '<'                 0.000    0.000    0.0000    0.0031
long phrase then valid-looking addr      0.001    0.001    0.0012    0.0023

WORST at the bound — round-1 forms: 3.24 ms   round-2 derived forms: 0.0035 ms
```

**Read this the right way round.** The number that matters is the FIRST pair: the
**round-1** forms cost up to **3.24 ms per hostile header at the bound**, and the
bound is what holds them there — unbounded, the same shape costs 3 393 ms at
n=32 000. Three to four milliseconds for a hostile header is a non-question, and
that is the entire point: **the bound is the answer, not the speed of any
particular pattern.** The derived forms' 0.0035 ms is a property of the derivation,
recorded because it is true, and it is explicitly NOT what the invariant rests on —
if the grammar is ever revised, the bound still holds and the derivation's speed
must be re-measured.

### R2-A REPRODUCED — and my round-2 non-reproduction was a measurement defect

**Correction, 2026-09-05.** The round-2 pass recorded "I could not reproduce the
quadratic timing." **That was wrong, and the cause is now determined.** R2-A is
real on this engine.

The orchestrator reproduced it on Node v25.9.0 with the round-1 forms exactly as
Table B stated them, timing `process.hrtime.bigint()` around a single `.test()`:

```text
input A = "a@" + ".".repeat(n) + "!,"        (mailbox form wrapped as "<" + A + ">")
input B = "a@" + "b.".repeat(n/2) + "!,"

n=998    A: bare=0.8ms   mbox=3.4ms    | B: bare=0.39ms
n=4000   A: bare=11.5ms  mbox=52.7ms   | B: bare=5.75ms
n=8000   A: bare=45.9ms  mbox=213.1ms  | B: bare=22.98ms
n=16000  A: bare=184.9ms mbox=847.3ms  | B: bare=92.01ms
n=32000  A: bare=741.2ms mbox=3393.7ms | B: bare=367.54ms
```

Re-run here from a FILE, same engine, the numbers land on top of the
orchestrator's — and the shape I had used in round 2 is quadratic too:

```text
=== ROUND-1 forms ===
    n      A:bare     A:mbox      B:bare    MINE:bare   (ms, single .test())
   998       0.77       3.33        0.37         1.48
  4000      12.05      55.33        5.81        22.94
  8000      45.92     211.71       22.95        91.75
 16000     184.33     847.96       91.94       368.31
 32000     737.64    3392.91      366.93      1476.18
```

Doubling `n` quadruples the time on every column, my own shape included.

**Cause of the non-reproduction — determined, not guessed.** The round-2
measurement ran inside a shell `node -e '…'`, and the nested quoting doubled every
backslash in the pattern. The regex actually built was not the one Table B stated:

```text
Table B stated : ^([^\s<>,;:"\\@\[\]()]+@[^\s<>,;:"\\@\[\]()]+\.[^\s<>,;:"\\@\[\]()]+)$
what ran       : ^([^\\s<>,;:"\\\\@\\[\\]()]+@[^\\s<>,;:"\\\\@\\[\\]()]+\\.[^\\s<>,;:"\\\\@\\[\\]()]+)$
identical?     : false
```

Every `\s` became a literal backslash plus `s`, and `\.` became a literal backslash
plus any character — so the class no longer excluded whitespace, and the domain's
dot was no longer a dot. The mangled pattern fails almost immediately on every
input and never reaches the ambiguous domain split. Measured side by side:

```text
    n   MANGLED:A   CORRECT:A   MANGLED:MINE  CORRECT:MINE   (ms)
  998       0.032       0.761          0.002         1.437
 4000       0.002      11.505          0.002        22.907
16000       0.004     183.943          0.009       367.393
```

A flat 0.002 ms at every size — which is exactly what round 2 reported and read as
"no super-linear growth".

**This is the runbook's own named failure**, and it is worth stating in its own
words: *"a pattern passed through nested quotes silently changes what the gate
matched, and the result looks like the gate moved. Put the gate in a file, quote
once, and compare against the literal there."* Round 2 broke that rule while
measuring a regex, and then published the reading as a disagreement with a
reviewer. **The lesson for this loop: a non-reproduction is a claim like any other,
and it carries the same burden of a correct run — the bar for contradicting a
reviewer is higher than the bar for agreeing, not lower.** Every regex measurement
in this record has since been re-run from a file.

**What does NOT change: the contract.** Step 2's 998-character pre-parse bound was
chosen precisely so the answer does not depend on who measured what, and the
correct numbers make that case better than the wrong ones did — at the bound the
round-1 forms cost 3.24 ms per hostile header instead of 0.0035 ms, and both are a
non-question. The bound is the answer; the pattern's speed is not.

### R2-E re-proved, block extracted VERBATIM from the spec

```text
COMPLIANT                          exit=0  V5 OK: 9 verbs; 5 gmail verbs, each matching Table A COMPLETELY
MUTANT id pattern removed          exit=1  create_reply_draft record differs from Table A
MUTANT required emptied            exit=1  create_reply_draft record differs from Table A
MUTANT capabilityClass changed     exit=1  create_reply_draft record differs from Table A
MUTANT extraClasses dropped        exit=1  create_draft_to_self record differs from Table A
MUTANT cap 3->99                   exit=1  create_draft_to_self record differs from Table A
MUTANT additionalProperties true   exit=1  create_reply_draft record differs from Table A
PINNED BASE                        exit=1  verb table is [… "create_draft" …]
DELIVERABLE ABSENT                 exit=1  require throws
```

The first six columns are the finding: every one of those mutants passed the
round-2 V5.

### Owner items — one added

**Item 8 (NEW): Table B step 2's 998-character pre-parse bound is a new refusal of
pathological-but-legal headers.** *Recommendation: take the bound* — it makes the
grammar's cost a non-question on any engine rather than a claim to be re-argued
after every pattern change, and it is unreachable by conforming mail (a value that
long would have arrived folded, and folding means CRLF, which step 0 refuses).
*Cost of overruling:* the worst case reverts to an input-dependent claim needing
re-measurement on every engine after every change — which is what the two Table B
cost findings were. **No other owner item's RULING changed:** item 7's narrowing is
restated to name the grammar's full refusal set, and item 4 is untouched. The list
is now **eight**.

### STOP CRITERION — restated

**The loop closes** when one full round returns **no product finding on either
channel**. All seven round-2 findings were HEAVY, so **round 3 is a full fresh
external round on both channels**, asked additionally to verify each round-2 fix is
genuinely closed rather than re-worded — with R1-D as the standing example that
"closed" must be re-measured, not asserted.

**Escalation, with the breaker already fired once:**

- **(i) The Table B breaker has FIRED and been answered by a contract pass.** The
  test for round 3 is therefore sharper than "another Table B finding": **a round-3
  Table B finding that is NOT a case the executed 39-case table already refuses
  means the contract pass FAILED** — and the next step is then an **owner ruling on
  the recipient design itself** (whether `create_reply_draft` should derive a
  recipient at all), not a fourth attempt at the derivation. A round-3 Table B
  finding that IS already refused by the executed table is a documentation finding
  about the table's presentation, and is LIGHT.
- **(ii) Owner-boundary findings PARK.** Round 2 forced exactly one: the 998 bound,
  now item 8. No grant, allowlist, cap, scope set, or the deletion moved.
- **(iii) Scope objections** stay routed. Rounds 1 and 2 produced zero.

### Round table

| Round | Channel | Raw file | Raw-commit SHA | Verdict |
|---|---|---|---|---|
| 0 | architect (this record) | — | — | template-conformant; 12 coherence findings dispositioned; V4/V5 proven in three states; 7 owner items parked; stop criterion pinned |
| 0 | orchestrator executors | — | — | template CONFORMS; 8 coherence findings, all LIGHT, folded before round 1 |
| 1 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round1-codex-plugin.txt` | `6ca9f75f` | needs-attention, 0 scope objections — R1-A (high/A), R1-B (medium/B), R1-C (high/A), R1-D (medium/B) |
| 1 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round1-herdr-shadow.txt` | `c8222247` | needs-attention, 0 scope objections — R1-A (A, converged), R1-C (A, converged), R1-E (A) |
| 2 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round2-codex-plugin.txt` | `b2d987eb` | needs-attention, 0 scope objections — R2-A (A), R2-B (B), R2-C (A), R2-D (B, converged), R2-E (A, converged), R2-G |
| 2 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round2-herdr-shadow.txt` | `dda7aaaa` | needs-attention, 0 scope objections — CR/LF-before-refusal (A, folded into the Table B contract pass), R2-D (B, converged), R2-E (A, converged), R2-F (B) |
| 2 | **ADR-0031 breaker** | — | — | **FIRED on Table B** (2 findings round 1 + 3 round 2) → contract pass: Table B restated as an ORDER with bounds before parsing; 39-case pipeline executed, 0 mismatches |
