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

## Round 3 — external double channel, 2026-09-05, on `937bae59`

Both channels **needs-attention**, **zero scope objections**; plugin 1A + 2B + 2
LIGHT, shadow 4A + 2B; **five of six CONVERGED**. Raws committed pre-adjudication:

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round3-codex-plugin.txt` | `12e5ed44` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round3-herdr-shadow.txt` | `7fd20a32` |

**No finding against the recipient GRAMMAR outside the executed table — the
breaker's answer held where it was aimed.**

### The pinned stop criterion FIRED, and how it was ruled

Two Table B rows admitted cases the 39-case table did not refuse: step 1
trimmed and selected *before* the bound (a 4 MB whitespace-only `Reply-To` beside a
valid `From` was scanned and trimmed unbounded), and step 5 truncated the Subject
to 512 *after* acceptance (breaking Gmail's documented Subject-match threading
condition and splitting a surrogate pair into `U+FFFD`). The criterion said: owner
ruling on the recipient design. **The orchestrator's judgment under the owner's
standing instruction, recorded verbatim as the disposition and as owner item 9:**

> These two are the ORDER contract not yet applied to two of its own rows — the
> same "parsing before bounding" defect the pass named, surviving in step 1 and
> step 5 — not evidence against deriving the recipient from the message.
> Item 9: *keep `create_reply_draft` as a code-derived-recipient verb;
> recommendation: keep; cost of overruling: inbox-triage loses its only outward
> action (drafts nothing), and the audit's group D ruling is reopened.*

The owner may reverse by dated amendment.

| # | Channel(s) | Band | Finding | Disposition |
|---|---|---|---|---|
| **R3-A** | CONVERGED | HEAVY | Steps 1–2: trim/select ran before the bound, so an oversized value was processed unbounded. | **fix** — **ONE rule, applied to EVERY raw value the verb reads**, and moved to **step 0**: each of the five raw values must be ≤998 **before any other operation**. The invariant is now absolute — *nothing whose cost grows with input length runs before the bound* — which is why the bound precedes even the CR/LF scan (see the reorder note). Two cases added to the executed table: an oversized whitespace-only `Reply-To` beside a valid `From` → refused at the bound; a ≤998 whitespace-only `Reply-To` beside a valid `From` → falls through to `From`, **accepted**. Item 8 is now "the 998 bound on every raw header value the verb reads". |
| **R3-B** | CONVERGED | HEAVY | Step 5 truncated the derived Subject to 512 after acceptance — breaking Gmail's Subject-match threading requirement and splitting astral characters. | **fix** — **the truncation is removed entirely.** The source Subject is bounded at 998 by step 0, so the derived subject is `Re:` + space + the source **unmodified**, ≤1002 characters. Verified by measurement that nothing downstream re-imposes a cap: `src/gws/gmail.js` enforces **no** length on any header — `buildMime` (`:150-160`) asserts CR/LF-freedom and nothing else, `draft` (`:131-142`) passes the MIME through untouched. The 512 ceiling remains **only** on the model-supplied `subject` of `create_draft_to_self`. Gmail's three threading requirements are cited in a restored Table B bullet; criterion 5 and `[AUD-D4]` re-derived; long-Subject and boundary-astral cases added. |
| **R3-C** | CONVERGED | HEAVY | Table C's `reply-headers-unasserted` is **unkillable through `create_reply_draft`** — the CR/LF step refuses first, identically for correct and mutant code, for every field. The round-2 trap note naming `Message-ID`/`References` as discriminating was wrong. | **fix, by splitting the property from its proof site.** `[AUD-D5]` becomes the **step-1 proof**: it asserts the refusal is step 1's, by its fixed `WienerdogError` text (distinct from `assertHeaderSafe`'s), plus zero `drafts.create`; its mutation deletes one named field from step 1's scan, so the mutant falls through to step 7 and refuses with a *different* message. A new `[AUD-D7]` in `tests/unit/gws-gmail.test.js` takes `reply-headers-unasserted` by calling `buildMime` **directly**. Table C now spans **three suites / three declaration files**. Fixture ownership is stated so the sets cannot overlap: `[AUD-D5]` owns every CR/LF case arriving through the verb, `[AUD-D7]` owns only direct `buildMime` calls, `[AUD-D3]` owns the **non-CR/LF** refusals and carries no CR/LF fixture. |
| **R3-D** | CONVERGED | HEAVY | V5 omitted `inputSchema.type`, so `type:'string'` passed; and it never compared the schema's top-level key set. | **fix** — V5 now compares `type` **and** the complete top-level schema key set, and its success line names exactly what it verifies and what it does not (handlers, descriptions, `apiMethod`). Re-proved against nine mutants including the three new countermodels. |
| **R3-E** | shadow A | HEAVY | The default-loader pin proved only that `loadServices` resolves to `loadCredentialServices`. A consumer using `requiredClassesFor` **only when `deps.loadServices` was supplied** passes everything while production stays broken. | **fix** — criterion 8's requested-class and missing-class assertions must hold on the **no-`deps` path** too. Seam chosen and stated in Exact contracts: the default is resolved **once at entry** (`deps.loadServices ?? loadCredentialServices`), every later line uses that binding, there is **no branch on `deps` anywhere** in `assembleRegistry`, and both consumer sites call `requiredClassesFor` unconditionally — so the tested path and the production path are one body. New mutation `required-classes-gated-on-deps` declared. |
| **R3-F** | CONVERGED | LIGHT→HEAVY (item premise) | Item 8's "unreachable by conforming mail" is **false**: Gmail's API returns unfolded values, RFC 5322 §2.2.3 permits unfolded fields of any length, and a conforming phrase folded at ≤81 chars/line unfolds to 1 239 characters with no CR/LF. | **fix** — item 8 now states plainly that **the bound can refuse conforming mail**, names the cost (a legitimate long `Subject`, `References` chain or display name gets no reply drafted), and keeps the recommendation. The false premise is retracted in place. |

### Re-executed as the NEW pipeline — 44 cases, 0 mismatches

```text
ok   refuse:step0-raw-over-998    R3-A: 4M whitespace-only Reply-To + VALID From -> refused AT THE BOUND
ok   refuse:step0-raw-over-998    R3-A: 4M Subject / 4M Message-ID / 4M References -> refused at the bound
ok   alice@example.org            R3-A: <=998 whitespace-only Reply-To + valid From -> falls through to From
ok   refuse:step1-crlf            CR/LF in Subject beyond char 512 (and every other CR/LF family)
ok   refuse:step0-raw-over-998    999-char From — one over the bound

--- R3-B: the derived subject is NOT truncated ---
  900-char Subject: accepted=true, derived length=904, equals "Re: "+source? true   (old rule truncated to 512)
  boundary-emoji Subject: contains U+FFFD? false, round-trips? true
  OLD rule on the same input would give: ..."xxx\ud83d"        <- a lone high surrogate
  idempotent /^re:/i: "Re: already"
  max derived subject length = 4 + 998 = 1002

44 cases, 0 mismatch(es)
```

### Two measurements that did NOT come out as instructed — reported, not quietly followed

Round 2's lesson was that a non-reproduction carries the same burden as any other
claim, so both of these were run from a FILE, across six shapes and a 16× size
range, before being written down.

**1. The quadratic trim did not reproduce; `htrim` is LINEAR on this engine.**

```text
htrim  all spaces                        0.2      0.3      0.7      1.8      2.8   (n = 0.25M 0.5M 1M 2M 4M, ms)
htrim  spaces + ONE trailing X           0.2      0.3      0.7      1.3      2.7
htrim  X + spaces (trailing run)         0.2      0.3      0.7      1.3      2.8
htrim  spaces + X + spaces               0.2      0.3      0.7      1.3      2.9
htrim  alternating " X"                  1.2      1.3      2.6      5.2     10.4
htrim  tabs + ONE trailing X             0.2      0.4      0.8      1.3      2.6
```

Every row scales with `n`, not `n²`. The plugin measured 74/299/1179 ms; I get
0.7/1.8/2.8 ms at the same sizes. **This changes nothing about the fix** — the
defect is *unbounded work on attacker-controlled input*, and linear is still
unbounded; a 4 MB value costs ~3 ms of trim plus ~0.6 ms of CR/LF scan, against
**0.012 ms** for the length comparison that now precedes both.

**2. The instructed "linear predicate" is SLOWER than the trim it replaces**, so it
is not prescribed:

```text
pred   all spaces                        1.5      1.0      2.1      4.2      8.4   (vs htrim 0.2 … 2.8)
pred   tabs + ONE trailing X             0.5      0.9      1.8      3.8      7.2   (vs htrim 0.2 … 2.6)
```

Table B therefore fixes the **order** and says explicitly that, both operands being
≤998 by step 0, **how the content test is written is not a contract question** —
**[SUPERSEDED 2026-09-05 by round-4 finding R4-B: this was wrong. A bound on the
INPUT is not a bound on the machine that reads it; the test's form is now
prescribed in Table B step 2.]** —
which is the same principle the whole contract rests on, applied one level down: a
spec states the contract, never the implementation, and prescribing a measurably
slower implementation on the strength of an unreproduced complexity claim is
exactly the move the contract pass existed to stop.

### One deliberate deviation from the instructed order — flagged

The instruction was "after step 0's CR/LF scan, the 998 bound applies". **The bound
is instead step 0, before the CR/LF scan.** Reason: a CR/LF scan of a 4 MB value is
itself an unbounded operation (measured 0.61 ms, linear), so with the scan first the
invariant would have to read "nothing unbounded before the bound, except this one
scan". Bound-first makes it absolute and costs nothing. The only observable
difference is which refusal a value that is both oversized *and* CR/LF-bearing
receives; both refuse with zero `drafts.create` calls. Easily reverted if the
orchestrator prefers the stated order.

### V5 re-proved — nine mutants, from the block extracted VERBATIM

```text
COMPLIANT                                 exit=0  V5 OK: the verb table is exactly Table A's 9 names; exactly 5 …
MUTANT type:'string'          (R3-D new)  exit=1  record differs from Table A
MUTANT type:'array'           (R3-D new)  exit=1  record differs from Table A
MUTANT extra top-level key    (R3-D new)  exit=1  record differs from Table A
MUTANT id pattern removed                 exit=1  record differs from Table A
MUTANT required emptied                   exit=1  record differs from Table A
MUTANT capabilityClass changed            exit=1  record differs from Table A
MUTANT extraClasses dropped               exit=1  record differs from Table A
MUTANT cap 3->99                          exit=1  record differs from Table A
MUTANT additionalProperties true          exit=1  record differs from Table A
PINNED BASE                               exit=1  verb table is [… "create_draft" …]
DELIVERABLE ABSENT                        exit=1  Cannot find module
```

### An editing accident found while applying R3-B

Table B's **"no claim of measured Gmail acceptance"** bullet had been **silently
dropped** by round 2's wholesale Table B rewrite — a deliberate non-claim lost to a
section replacement, which no mirror checklist can catch because the mirror was the
section itself. It is restored, now carrying the Gmail threads-guide citation, and
labelled as restored. **Recorded as a recurrence of round 2's R2-D lesson at a
larger granularity: after replacing a SECTION, re-read the section it replaced.**

### STOP CRITERION — sharpened and FINAL for this contract

**The loop closes** when one full round returns no product finding on either
channel. All of round 3's findings were HEAVY, so **round 4 is a full fresh
external round**, asked additionally to verify each round-3 fix is genuinely
closed.

- **(i) Table B — final form.** **Any Table B finding in round 4 that the executed
  44-case table does not already refuse → STOP.** No further
  dispatch-under-recommendation on Table B; the session waits for the owner. A
  round-4 Table B finding that the executed table *does* already refuse is a
  presentation finding and is LIGHT.
- **(ii) Owner-boundary findings PARK.** Round 3 produced item 9 (the escalation's
  disposition) and corrected item 8's premise. No grant, allowlist, cap, scope set,
  or the deletion moved. The list is now **nine**.
- **(iii) Scope objections** stay routed. Rounds 1, 2 and 3 produced zero.

## Round 4 — external double channel, 2026-09-05, on `f276cbfe`

Both channels **needs-attention**, converged on the main finding. Raws committed
pre-adjudication:

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round4-codex-plugin.txt` | `08eec164` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round4-herdr-shadow.txt` | `62710758` |

### THE FINAL STOP CRITERION FIRED — Table B is FROZEN

Round 4 raised two accepted classes the executed 47-case table does not refuse, on
a contract that had already fired the ADR-0031 breaker, so the criterion pinned at
the end of round 3 applies exactly as written: **STOP.** Table B, its derived
forms, its case table, the step-referencing text in criteria 3–6, and owner items 8
and 9 are **frozen and untouched in this pass**; **there is no further
dispatch-under-recommendation on this contract**; the work package **stays
`status: Draft`, parked on an owner ruling.** The ruling brief is
`docs/specs/logbook/2026-09-05-audit-d-owner-brief-derived-headers.md`.
**Resuming looks like:** one architect pass applying the ruling, then round 5 as a
closing confirmation on both channels.

| # | Channel(s) | Band | Finding | Disposition |
|---|---|---|---|---|
| **R4-A** | plugin B **+** shadow A — **CONVERGED** | HEAVY | The raw 998 bound does not bound the **physical header lines built after steps 5 and 6**. A 998-character source `Subject` → `Re:` + space + it = 1002 characters → a **1011-character `Subject:` line**. Twenty 47-character Message-IDs → a 959-character `References` that passes step 0, after which step 6 appends the parent id → **1007 characters, a 1019-character line**. `buildMime` (`gmail.js:150-160`) emits single physical lines with no folding and no RFC 2047, so RFC 5322 §2.1.1 is violated **by accepted inputs**, and the stubbed-client assertions pass while Gmail would receive non-conforming MIME. | **PARKED — owner ruling.** Options (a) refuse at the output, (b) fold/encode in `buildMime`, (c) trim `References` from the middle then (a) for `Subject`, each with its cost, are in the brief. Orchestrator's recommendation, recorded as such: **(a) plus the two small fixes**, with (c) named as the successor if dogfooding shows deep threads matter. |
| **R4-B** | plugin A | HEAVY | "The bound makes the content test's form irrelevant" is **false**. `!/^(?:[ \t]+)*$/.test(value)` is a semantically correct blank-check that backtracks **exponentially**: 30 spaces followed by an address — 47 characters, far under the bound — exceeded **1.5 s**. Bounded input does not make an arbitrary regex safe. | **PARKED — owner ruling** (it lives in a frozen Table B row). The intended fix is one line: prescribe the blank-check as a single non-backtracking scan, `/[^ \t]/.test(v)`, linear by construction. **This finding also corrects the round-3 record**, where the content test was deliberately left unspecified on the strength of the bound; the bound bounds the *input*, not the *pattern*, and round 3 conflated the two. |
| **R4-C** | shadow B | HEAVY | An empty or whitespace-only source `Subject` derives `Re:` followed by a space, which on the next application trims to `Re:`, matches `/^re:/i`, and is left alone — **non-idempotent across a chain**. The only idempotence fixture was `Re: already`. | **PARKED — owner ruling** (frozen row). Intended fix: an empty trimmed source subject derives an **empty** subject — no `Re:` on nothing — which is a fixed point and still satisfies Gmail's subject-**equality** condition. Fixtures: empty, spaces, tabs, two applications. |
| — | both channels | scope objection, **excluded from the verdict** | With representative 47-character Message-IDs, an ordinary thread about **21 messages deep** arrives unfolded over 998 characters and is refused outright by step 0. | **Not a defect** — this is owner item 8's admitted cost, now **quantified**, and it is carried into the owner brief so the ruling can weigh it. |

### Non-Table-B machinery fixes — applied in this pass (LIGHT)

None of these touch a Table B row.

| Fix | What was wrong | What changed |
|---|---|---|
| **V5, key ≡ name** | Both channels executed wrong verb tables that V5 passed. Swapping the two new verbs' `name` fields leaves each schema advertised under the **other** verb's name; renaming `calendar_list` internally and reclassing it to `DRAFT` was invisible because V5 only inspected gmail verbs. | V5 now asserts `VERBS[key].name === key` for all nine, and compares the **complete canonical record of ALL NINE** verbs — `service`, `capabilityClass`, `extraClasses`, the whole `limits` object, the schema's top-level key set, `type`, `required`, `additionalProperties`, every property schema. Criterion 1 and its mirrors re-derived. |
| **Mirror rot — proofs files** | The Table C mirror said "**both** `.proofs.json` files"; there are three since round 3. | Names all three, plus both new test suites. |
| **Mirror rot — `[AUD-D6]`** | "The **three** `[AUD-D6]` declarations"; there are four since R3-E added `required-classes-gated-on-deps`. | The sentence no longer predicts a count. |
| **Case-table count** | The document said **44**; the plugin rendered **47**. | The table has always listed **47**. The 44 was the pipeline array's length — the 3 step-5 subject rows were asserted separately. The prose now says 47 and explains the split, so the number stops disagreeing with the table above it. |

### V5 re-proved — eleven mutants, from the block extracted VERBATIM

```text
COMPLIANT                                            exit=0  V5 OK: … 9 names, each table key equals its record name …
MUTANT names of the two new verbs SWAPPED  (R4 new)  exit=1  the table KEY and the record name must be the same string
MUTANT calendar_list renamed + reclassed   (R4 new)  exit=1  the table KEY and the record name must be the same string
MUTANT type:'string'                                 exit=1  record differs from Table A
MUTANT id pattern removed                            exit=1  record differs from Table A
MUTANT required emptied                              exit=1  record differs from Table A
MUTANT capabilityClass changed                       exit=1  record differs from Table A
MUTANT extraClasses dropped                          exit=1  record differs from Table A
MUTANT cap 3->99                                     exit=1  record differs from Table A
MUTANT additionalProperties true                     exit=1  record differs from Table A
MUTANT extra top-level schema key                    exit=1  record differs from Table A
PINNED BASE                                          exit=1  verb table is [… "create_draft" …]
DELIVERABLE ABSENT                                   exit=1  Cannot find module
```

The two new rows are the finding: both of those tables passed the round-3 V5.

### The pattern across four rounds, stated once

V5 has now been wrong **four** times — over-strict (round 0), a denylist (round 1),
names-only (round 2), and gmail-only without a key/name tie (round 4) — and every
time a both-directions run is what caught it. Each fix moved the check one step
further toward *enumerating the intended object completely* rather than checking a
property of it. That is the same move the Table B contract pass made, and R4-B is
the same lesson arriving from the other side: **a bound on the input is not a bound
on the machine that processes it.** Round 3 wrote that the bound made the content
test's form irrelevant; it does not, and that sentence is now a parked correction
rather than a standing claim.

### STOP CRITERION — fired; no successor is pinned by this session

The criterion pinned at the end of round 3 was final for this contract and it has
fired. **This session does not pin a round-5 criterion**, because what round 5
checks depends on which option the owner picks. When the ruling lands, the applying
pass restates the criterion in the same place, before round 5 runs.

- **(i) Table B — STOPPED.** Frozen pending the ruling. Nothing on this contract is
  dispatched under a recommendation.
- **(ii) Owner items** stand at **nine**; round 4 added none. R4-A/B/C are parked
  against item 9's question rather than as new items, because all three are
  consequences of the same ruling.
- **(iii) Scope objections** — round 4 produced one (the 21-deep thread), excluded
  from the verdict by both channels and carried into the owner brief as a cost.

## The owner's ruling, and the pass that applied it — 2026-09-05

Round 4 froze Table B and produced
`docs/specs/logbook/2026-09-05-audit-d-owner-brief-derived-headers.md` at
`197cd797`. The owner read it and answered **in session**:

```text
go with a) as you recommended
```

**This is the tenth decision of the loop and the FIRST DIRECT one** — items 1–9
were dispatched under the standing instruction. Full provenance and disposition:
`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`. Ruled:
**(a) refuse at the output**, plus R4-B's prescribed blank-check and R4-C's
empty-subject fixed point. **(c)** named as successor, not filed. **(b)** rejected
for this package. Table B was unfrozen for exactly this pass.

### What was applied

| Ruling | Where |
|---|---|
| (a) the output bound | **Table B step 7** — for each header line `buildMime` will emit whose length is not fixed by an earlier step (`Subject`, `In-Reply-To`, `References`), `<name>: <value>` must be ≤998 **UTF-8 octets**. `To:` (4 + ≤320 by step 4) and the fixed `Content-Type` are bounded by construction and are stated as not checked, so the rule quantifies over a closed set |
| the measure | **UTF-8 octets**, because RFC 5322 counts octets of the transmitted line and `buildMime` calls `Buffer.from(mime)` — UTF-8 is what Gmail receives |
| R4-B | **Table B step 2** — the blank-check is the derived form `/[^ \t]/.test(v)`, prescribed, not left open |
| R4-C | **Table B step 5** — an empty trimmed source subject derives the **empty string**; the derivation is a fixed point |
| the messages | **Exact contracts** — three distinct fixed refusals (input/grammar, CR/LF, output bound), none of them `assertHeaderSafe`'s |
| the record | **Dispatch precondition item 10**, `RULED (a)`, marked as the first direct ruling; the section heading now says "ten: nine recommendations, one direct ruling" |

### Executed, from a FILE, before any of it was written down

```text
=== the three prefixes, measured (UTF-8 octets) ===
  "Subject: "      9 octets  -> value budget 989
  "References: "  12 octets  -> value budget 986
  "In-Reply-To: " 13 octets  -> value budget 985
  "To: "           4 octets  -> value budget 994   (bounded by step 4 at 320; not checked)

ok   ok                          989-octet Re:-prefixed subject -> line is exactly 998 -> ACCEPT
ok   refuse:step7-line-over-998  990-octet Re:-prefixed subject -> line is 999 -> REFUSE
ok   ok                          985-octet plain subject -> derived 989 -> line 998 -> ACCEPT
ok   refuse:step7-line-over-998  986-octet plain subject -> derived 990 -> line 999 -> REFUSE
ok   refuse:step7-line-over-998  329 euro signs = 987 octets, derived 991 -> line 1000 -> REFUSE
     (as UTF-16 code units that subject is 329 long and would have PASSED a length check)
ok   refuse:step7-line-over-998  References 974 + " " + 46-octet parent = 1021 -> REFUSE
ok   ok                          References 939 + " " + 46 = 986 -> line 998 -> ACCEPT
ok   refuse:step7-line-over-998  986-octet Message-ID passes step 0, In-Reply-To line = 999 -> REFUSE
ok   ok                          985-octet Message-ID -> In-Reply-To line = 998 -> ACCEPT

=== R4-C: the empty-subject fixed point ===
ok   ""          source empty / spaces / tabs -> derived subject is the EMPTY string
ok   ""          two successive applications on empty are identical
ok   "Re: Hello" two successive applications on "Hello" are identical

=== R4-B: the blank-check is linear by construction ===
  input: 30 spaces + a 17-char address (47 chars, far under the bound)
  /[^ \t]/.test(v)          : 0.0015 ms
  !/^(?:[ \t]+)*$/.test(v)  : 33962.1 ms   <- the round-4 finding

ALL CHECKS PASSED
```

### Two corrections the execution forced on the instruction

1. **`In-Reply-To` CAN exceed 998; the instruction said it could not.** The
   accompanying instruction read *"In-Reply-To alone cannot exceed it given step
   0 — say so"*. It can: the prefix costs 13 octets, so a **986-octet `Message-ID`
   passes step 0 and still yields a 999-octet line**. Step 7 therefore checks all
   **three** headers, and the spec says so rather than repeating the claim. Had the
   sentence been written as instructed, the spec would have carried a false
   universal over exactly the header the check exists for.
2. **R4-B is an order of magnitude worse than reported.** The brief cited "over
   1.5 s"; executed here on a 47-octet input, the pathological form took
   **33 962 ms**. The number in Table B step 2 is the measured one.

Both are the round-2 lesson still holding: *an instruction is a claim like any
other, and applying it without running it is how a false universal reaches a
contract.*

### STOP CRITERION — restated for round 5, the CLOSING CONFIRMATION

Round 5 runs on **both channels** as the closing confirmation.

- **Closes** on **zero product findings**. Machinery findings at that point are
  fixed **in-surface, without another round**, or accepted as named residuals.
- **Any product finding** → one more architect pass and a round 6.
- **A Table B finding the executed case table does not refuse → STOP again for the
  owner.** The ruling covers **(a)**; it does not license re-deriving anything else
  in Table B. If that happens, the successor question is already named: option (c).
- Owner items stand at **ten** — nine recommendations plus item 10, `RULED`.

## Round 5 — external double channel, 2026-09-05, on `d3041ba0`

Both channels **needs-attention**; plugin 1A + 1B, shadow 3A + 1C; **zero scope
objections counted** (two routed). **Not closed** — one revision pass, then round 6
is the closing confirmation. Raws committed pre-adjudication:

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round5-codex-plugin.txt` | `3d80d955` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round5-herdr-shadow.txt` | `6b3857a2` |

| # | Channel(s) | Band | Finding | Disposition |
|---|---|---|---|---|
| **R5-A** | CONVERGED A | HEAVY | The refused `References` row was **1033** octets, not the stated 1021 (1021 is the *value*; the line adds the 12-octet prefix), and there was **no 999-octet `References` boundary at all** — a checker capping `Subject` and `In-Reply-To` at 998 but `References` at 1021 passed every listed row. Both channels executed it. | **fix** — the missing one-octet boundary is added (**940** + space + 46-octet parent = value 987 → line **999**, refused) beside the 998 accepted row; the 1021/1033 arithmetic is corrected; the 974 row is kept but **relabelled as a non-boundary accumulation case**, with the mislabelling called out in place. |
| **R5-B** | plugin B | HEAVY | **UNLICENSED CHANGE, confirmed by `git diff 197cd797 d3041ba0`.** Step 0's input bound had been moved from "998 characters" to "998 UTF-8 octets" while applying the ruling. The ruling licensed (a) at the **output** plus R4-B and R4-C — nothing at step 0 — and item 8 as ruled says characters. | **fix — reverted.** Step 0 is restored **byte-for-byte** to its `197cd797` wording (verified: `git diff 197cd797` shows no change to that row). Octets stay at step 7, and the spec now says plainly why the two bounds are in different units and that this is not a gap. The unit question is recorded as an **OPEN owner question** in the rulings record — *not* an item and *not* dispatched under the standing instruction, since the architect had just been caught making that exact change without a licence. |
| **R5-C** | shadow A | HEAVY (product) | Step 7 excluded `To` as "4 + ≤320 by construction", but **step 4's 320 is CHARACTERS and step 7 is OCTETS**. A grammar-accepted address of 247 astral characters + `aa@b.co` is 254 characters but **995 octets** → a **999-octet `To` line**. | **fix** — `To` joins step 7's checked set. This **implements** ruling (a) ("every built header line") rather than extending it. Step 7 now quantifies over every line `buildMime` emits for this verb except the fixed `Content-Type`, and `From` is excluded **with its reason and citation**: `buildMime` emits `From` only when its argument carries one (`gmail.js:152`), and `replyTarget`'s result shape has no `from`. The "bounded by construction" sentence is deleted. Accepted-998 / refused-999 `To` rows added. |
| **R5-D** | shadow (step-0 octet fixtures) | dissolved | Fixtures written for an octet-based step 0. | **dissolved by R5-B** — step 0 counts characters again, so those fixtures have no subject. The 329-`€` row is now explicitly labelled a **step-7 (output)** fixture. |
| **R5-E** | both channels | LIGHT | Stale "step 7's `assertHeaderSafe`" (now step 8); the "nothing caps the derived subject" claim (it now has an output bound); "only the *recipient* rules fail loud"; criterion 4's step list; Table C's declaration counts. | **fix** — all corrected, and every step-number mirror re-swept after the step-7 insertion. Both count sentences (Table C's identities/declarations and the case table's total) now **point at their tables instead of predicting a number** — each had gone stale twice. |

### Routed scope objections — recorded, not acted on

- **`U+00A0` under the ruled ASCII predicate.** `U+00A0` is Unicode horizontal
  whitespace, but R4-B's ruled `/[^ \t]/` treats it as content, so a
  `U+00A0`-only `Reply-To` is selected and then **grammar-refused** rather than
  falling through to `From`. Executed and confirmed: the outcome is
  `refuse:step3-not-one-mailbox` — **a refusal, never a wrong recipient.** Recorded
  as a named residual under owner item 4. Widening the predicate to Unicode
  whitespace would reopen R4-B's cost question on the one test the owner just ruled
  must stay linear.
- **`buildMime`'s optional `From` has no length bound.** Pre-existing; it is not on
  this verb's data path. Recorded as a "Discovered issues" item for the
  implementer's PR, not fixed here.

### Executed from a FILE — every new boundary row, in octets

```text
=== R5-A: the References LINE arithmetic, corrected ===
  parent id is 46 octets; the References prefix is 12 octets
    refs 939 -> value  986 octets -> LINE  998 octets     ACCEPT
    refs 940 -> value  987 octets -> LINE  999 octets     REFUSE   <- the missing boundary
    refs 974 -> value 1021 octets -> LINE 1033 octets     REFUSE   (non-boundary; 1021 was mislabelled a line)

=== R5-C: can a To line exceed 998 octets? It depends on how step 4 counts. ===
    BMP 3-octet     under code units   : max To line   950 octets
    BMP 3-octet     under code points  : max To line   950 octets
    astral 4-octet  under code units   : max To line   635 octets
    astral 4-octet  under code points  : max To line  1263 octets   <-- CAN EXCEED
  the shadow's address: 254 code points, 501 code units, 995 octets -> To line 999
ok   refuse:step4-addr-over-320       under CODE-UNIT step 4 it never reaches step 7
ok   refuse:step7-line-over-998[To]   under CODE-POINT step 4 it passes step 4 and STEP 7 catches it
ok   ok                               code-point boundary 246 astral -> To line 995 -> ACCEPT

=== R5-B: step 0 is CHARACTERS again (the ruled item 8, restored) ===
ok   refuse:step7-line-over-998[Subject]      998 EUR characters = 2994 octets: passes step 0, refused by step 7
ok   refuse:step0-raw-over-998-CHARS[Subject] 999 characters -> refused at step 0

=== unchanged rows still hold ===
ok   ok                                       989-octet Re:-prefixed subject -> ACCEPT
ok   refuse:step7-line-over-998[Subject]      990 -> REFUSE
ok   ok                                       985-octet Message-ID -> In-Reply-To line 998 -> ACCEPT
ok   refuse:step7-line-over-998[In-Reply-To]  986-octet Message-ID -> a 999-octet line -> REFUSE
ok   ""                                       empty subject -> empty derived

=== routed: U+00A0 under the ruled ASCII predicate ===
ok   refuse:step3-not-one-mailbox   a U+00A0-only Reply-To beside a valid From -> selected, then grammar-REFUSED

ALL CHECKS PASSED
```

### What the R5-C measurement changed about the finding as filed

The shadow's numbers are **right, and my first attempt to reproduce them was
wrong** — I built the address from 3-octet BMP characters, which cannot reach the
boundary under either reading (max `To` line 950 octets), and briefly had four
failing checks that were my construction, not the finding. With **astral**
characters, which is what the shadow used, the arithmetic is exact: 247 astral +
`aa@b.co` = 254 code points / 501 code units / 995 octets → a 999-octet line.

The finding is therefore **conditional on how step 4's "320 characters" is read**:
under `.length` (code units) a `To` line cannot exceed 950 octets and the case is
unreachable; under code points it reaches 1263. **The spec does not pin that unit,
and step 7 is the right fix precisely because it does not depend on resolving it** —
a check that is correct either way beats one that needs an ambiguity settled
elsewhere first. Both readings are now in the record.

**One thing this pass deliberately does NOT do:** pin step 4's unit. That would be
a second unlicensed change on a ruled row, which is the mistake R5-B just caught.
Step 7 makes it safe either way.

### STOP CRITERION — round 6 is the CLOSING CONFIRMATION

- **Closes** on **zero product findings on both channels**. Machinery findings at
  that point are fixed **in-surface, without another round**, or accepted as named
  residuals.
- **Any product finding** → one more architect pass and a round 7.
- **A Table B finding the executed case table does not refuse → STOP for the
  owner.** The ruling covers (a); it licenses nothing else in Table B, and R5-B is
  the evidence that this boundary needs enforcing against the architect too.
- Owner items stand at **ten**. Round 5 added none: R5-C implements the existing
  ruling, R5-B reverts to it, and the unit question is recorded as **open**, not as
  an item.

## Round 6 — external double channel, 2026-09-05, on `f2d6acc5` — THE LOOP CLOSES

Both channels **needs-attention**, and both state **by execution** that the
output-safety rule held: **no accepted input yields a CR/LF bypass or an
over-998-octet line** (plugin: 111 pipeline cases; shadow: full pipeline plus
boundary probes). Every remaining finding is gate machinery, wording, or scope
restoration. **Under the pinned Weighted-closure criterion the loop CLOSES at round
6**: zero product findings on both channels, so the machinery fixes land in-surface
and are verified mechanically rather than by a seventh round.

| Channel | Raw file | Raw-commit SHA |
|---|---|---|
| Codex plugin (adversarial) | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round6-codex-plugin.txt` | `67b04075` |
| Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round6-herdr-shadow.txt` | `41a51070` |

| # | Channel(s) | Band | Finding | Disposition |
|---|---|---|---|---|
| **R6-A** | CONVERGED | LIGHT (gate) | The "accepted at exactly 998" `To` fixture was **995**, not 998 — an off-by-three that left the accepted boundary unpinned. | **fix** — the shadow's exact witness is used and executed: **246 astral + `U+0800` + `aa@b.co`** = 254 code points, 500 code units, **994 value octets, 998-octet line**. (The plugin's `aaaaa@b.co` variant also lands on 998; one was chosen.) The 999 refusal is kept. Criterion 5's `To` assertions are now explicitly **conditional on the step-4 unit reading**: under code points both rows are reachable and asserted; under UTF-16 `.length` both witnesses refuse at step 4 and the assertion becomes "step 4 refuses; no `To` line over 998 is reachable" — **measured maximum 950 octets**. Step 4's unit is still **not** pinned. |
| **R6-B** | CONVERGED | LIGHT (gate) | The R5-B rollback was **incomplete**: step 5's input cell still read "≤998 octets by step 0", and the accepted raw-boundary row had been changed to "exactly 998 octets". | **fix** — both restored to characters. Octets now appear **only** in step 7 and its output fixtures. The full hunk audit against `197cd797` is below. |
| **R6-C** | plugin B | LIGHT (scope restoration) | Step 1's fixed refusal message had been **changed at the ruling pass** from the existing generic reply-address refusal to a new line-break-specific text — model-visible and **unlicensed**. | **fix — reverted.** The `197cd797` message is restored; the "three distinct messages" claim becomes **two** (the generic steps-0–4 refusal, and step 7's new output-bound refusal, which is new because the ruling requires a refusal that did not exist). `[AUD-D5]` now asserts **zero `drafts.create` AND that `buildMime` was never invoked** — see the trap below. |
| **R6-D** | CONVERGED | LIGHT (wording) | "reaches step 7's refusal"; "All three" `[AUD-D6]` declarations (there are four); "the code-unit mutation reddens only the euro row". | **fix** — all corrected; every step-number mirror re-swept after the step-7 insertion; the `[AUD-D6]` sentence now **points at Table C** instead of counting. |
| **R6-E** | shadow C | LIGHT (record) | The rulings record omitted `To` from the applied output set, and called the OPEN unit question "no product consequence". | **fix** — `To` added, described as a round-5 **completeness correction under** the ruling rather than an extension. "No product consequence" is replaced by the measured truth: **no output-safety consequence, but availability differs** (below). |

### The fourth masking trap — found while applying R6-C, and it changes the proof

Restoring one generic message for steps 0–4 removes the discriminator `[AUD-D5]`
had been resting on, so the proof was re-derived by execution rather than argued:

```text
=== does [AUD-D5] still discriminate with ONE generic message? ===
  From         correct: step 1 / GENERIC   mutant: step 3 / GENERIC             buildMime 0->0   => INDISTINGUISHABLE
  Reply-To     correct: step 1 / GENERIC   mutant: step 3 / GENERIC             buildMime 0->0   => INDISTINGUISHABLE
  Subject      correct: step 1 / GENERIC   mutant: step 8 / assertHeaderSafe    buildMime 0->1   => DISCRIMINATES
  Message-ID   correct: step 1 / GENERIC   mutant: step 8 / assertHeaderSafe    buildMime 0->1   => DISCRIMINATES
  References   correct: step 1 / GENERIC   mutant: step 8 / assertHeaderSafe    buildMime 0->1   => DISCRIMINATES
  drafts.create is 0 in every row, correct and mutant alike — it can never be the discriminator.
```

**Step 1's scan cannot be proved on a recipient field**: drop it for `From` or
`Reply-To` and the grammar refuses the value at step 3 with the same message and
the same zero calls. Only the three non-recipient fields reach `buildMime`, where
`assertHeaderSafe` throws its **own** message. So `step1-scan-drops-a-field` must
name `Subject`, `Message-ID` or `References`, and the identity asserts **"buildMime
never invoked"** rather than a message or a call count. Recorded in the spec beside
the other three traps.

### R6-A and R6-B, executed from a FILE

```text
=== the exact 998-octet To witness ===
  shadow: 246 astral + U+0800 + 'aa@b.co'   254 code points, 500 code units, 994 value octets, To line 998
  plugin: 246 astral + 'aaaaa@b.co'         256 code points, 502 code units, 994 value octets, To line 998
ok   ok    witness accepted under CODE-POINT step 4 (To line exactly 998)
ok   7     999 witness refused under CODE-POINT step 4
ok   4,4   BOTH refuse at step 4 under CODE-UNIT step 4
  max To line reachable under CODE-UNIT step 4, over the whole grammar: 950 octets (never >998)

=== raw boundary is CHARACTERS ===
ok   7     998 ASCII characters PASS step 0 (then step 7 refuses: 9+4+998 = 1011)
ok   ok    985 ASCII characters pass step 0 AND step 7 (line exactly 998)
ok   0     999 characters refused at step 0
ok   7     998 EUR characters (2994 octets) pass step 0, refused at step 7

ALL CHECKS PASSED
```

### R6-E: the availability difference, measured

```text
  998 EUR chars in References, NO Message-ID:
    character bound (as ruled): DRAFTS — References is omitted because there is no Message-ID
    octet bound (hypothetical): would refuse at step 0 (2994 octets > 998)
    => not "no product consequence": no output-safety difference, but AVAILABILITY differs.
```

The character bound is the **more permissive** of the two and both are output-safe,
which is the honest way to put the open question to the owner.

### R6-B: the hunk audit against `197cd797`

**19 hunks, every one licensed.** Classified:

| Class | Hunks |
|---|---|
| ruling (a) — the output bound and its mirrors | 2, 3, 4, 6, 7, 10, 13, 14, 15, 16, 19, and 1 (the `replyTarget` step-range mirror, 0–6 → 0–7) |
| R4-B — the prescribed blank-check | 18 |
| R5-B rollback + the unit note | 4 (shared with (a)) |
| R5-A / R6-C / R6-D / R5-E gate fixes | 5, 8, 9, 11, 12, 17 |

Mechanically confirmed: `git diff 197cd797` contains **no** `998`-related change
outside step 7 and its fixtures except step 5's cell gaining the word *characters*,
which names the ruled unit rather than changing it. **An intra-cell re-read of the
spliced case-table paragraph also caught a duplicated sentence** left by an earlier
edit — the same re-read rule that R2-D established, doing its job.

### Mechanical verification of the closing tip, and the one defect it found

An independent clean-context executor ran over `c33e6a06`: **CLEAN** on every
licensed-hunk classification (step 0 byte-identical and in characters; step 5 and
the raw-boundary row in characters; step 1's message unchanged; the grammar forms
byte-identical), all **17 boundary witnesses exact** (accepted 998 / refused 999 /
the 1033 non-boundary row / 329 `€` = 987 octets), grammar spot-check 6/6, V5
correctly failing on the base tree, 19 Deliverables rows, 10 owner items,
frontmatter OK, lint 0 errors over 644 files.

**One defect, LIGHT, fixed in-surface.** A full Table-C-style row
(`step1-scan-drops-a-field`) had been spliced into the **middle** of the "fourth
masking trap" prose paragraph, breaking the sentence, and it **contradicted** the
real Table C row, which still described the mutant as reaching "step 7" — the
pre-renumbering step. **Cause:** the R6-C edit selected its target with
`next(l for l in lines if 'step1-scan-drops-a-field' in l)`, and the first line
containing that string was the *prose* sentence naming the proof id, not the table
row. The row was written over a sentence, and the real row was never touched.

Repaired: the prose sentence is restored, the orphaned `[AUD-D7]`/`[AUD-D3]`
ownership tail is moved back into the ownership paragraph where it belongs, and the
real Table C row now names the non-recipient fields and step 8. Verified after the
fix: no duplicate proof id, no orphaned table row anywhere in the document, and no
surviving "step 7" that means the old `assertHeaderSafe` step.

**The lesson, and it is the same one twice.** Selecting an edit target by a
substring that also appears in prose is how a table row lands in a paragraph — the
identifier-shaped match is not unique to the structure you meant. Every other edit
in this loop asserted `count(old) == 1` on a full anchored block; this one used a
line search, and it is the only one that broke. Anchor on the whole block, or
assert uniqueness.

**Accepted residual, not a change:** the V1–V5 verification blocks print
`V5 exit: $rc` and the wrapper's own exit status is the trailing `echo`'s 0. That
is pre-existing house style in this repo — the PR gate reads the **printed** rc,
not the block's exit — and it is recorded here so a reviewer does not re-find it as
a defect.

### CLOSURE

Under **Weighted closure** (`docs/runbooks/codex-review.md`): *"The loop is DONE
when a round finds nothing about the product. Machinery findings at that point are
fixed or accepted as named residuals; they do not extend the loop."* Round 6 found
**nothing about the product on either channel** — both executed the pipeline and
confirmed the output-safety rule holds. All five findings are gate machinery,
wording, or scope restoration, and all are fixed in-surface here.

**The design gate is CLOSED at round 6. There is no round 7.** The orchestrator
runs an independent clean-context executor over this closing tip; the spec moves to
`status: Ready` in this commit, and the dispatch-time re-verification gate
(`docs/runbooks/codex-review.md`) still runs before any implementer starts.

**Six rounds, one circuit-breaker firing, two stop-criterion firings, one owner
brief and one direct owner ruling.** Owner items stand at **ten**, plus one open
question. What the loop actually converged on, in one line: *bound what you read and
bound what you build, in the unit the consumer counts, and prove each check where
the property lives.*

## Implementation — erratum 1: the skill-digest anchor was not a Deliverables row

**2026-09-05, found at implementation on PR #224 (branch
`wp/audit-d-code-derived-recipients`, head `e66783b8`), before the PR gate.**

**What.** The spec's Deliverables table listed the two vendored
`skills/*/SKILL.md` files this WP rewrites, but **not**
`src/core/runtime-skill-digests.json` — the checked-in integrity anchor that
records the sha256 of each operating skill's raw bytes
(`src/core/runtime-settings.js:25-34`: *"Regenerated in the same PR whenever a
vendored operating skill legitimately changes"*). Editing either `SKILL.md` moves
its digest, so the WP as specified **could not be implemented in a green state**:
13 tests failed — the drift guard
`runtime-settings: every shipped operating skill matches its checked-in digest`
plus everything that loads the two skills. Merged as written, weekly-review and
inbox-triage would have refused to run at all: *"refusing to run tampered skill
text"*.

Measured on the implementation branch — the drift is exactly the two edited
skills, and only those two:

```text
wienerdog-inbox-triage     dbb82b44…  (checked in: e9f05dd8…)   MOVED
wienerdog-weekly-review    cf242bf4…  (checked in: e335d4fe…)   MOVED
wienerdog-dream            60fde183…  (checked in: 60fde183…)   identical
wienerdog-daily-digest     18035545…  (checked in: 18035545…)   identical
```

**The boundary worked.** The implementer did not touch the unlisted file — it
stopped and reported, which is exactly what the permission boundary is for. The
cost of the omission was one red PR, not a silently broken integrity anchor.

**Why six rounds missed it.** Every round attacked the *recipient* contract —
the grammar, the ordered steps, the bounds, the proofs. **No round ever drove a
`SKILL.md` edit through the runtime loader**, and no round asked the question that
would have caught it: *what else does editing this file move?* The two `SKILL.md`
rows were reviewed for their **content** (does the prose name the right verb?) and
never for their **consequences**. Adversarial review is bounded by the surface the
focus text points at, and every focus text this loop wrote pointed at the
derivation.

**Fixed in the spec** (docs-only, on the implementation branch, status stays
`In-Review`): the Deliverables row is added — nineteen rows to twenty — with the
exact regeneration rule in Exact contracts (lowercase sha256 hex of the raw bytes,
no normalisation; exactly four keys; the other two byte-identical), acceptance
criterion **10a** whose observable is the already-shipped drift guard, a note on
V1, and a **Mirrored Surface Checklist** entry that ties the digest row to the
`SKILL.md` rows so the pair cannot drift apart again.

**This is the same class the durability WP's round-1 reviewer caught**: a
Deliverables table that lists the file a change *edits* but not the file that
change *invalidates*.

**The lesson, one line: a spec that edits a vendored operating skill lists the
digest anchor as a Deliverables row.**

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
| 3 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round3-codex-plugin.txt` | `12e5ed44` | needs-attention, 0 scope objections — 1A + 2B + 2 LIGHT; no grammar finding outside the executed table |
| 3 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round3-herdr-shadow.txt` | `7fd20a32` | needs-attention, 0 scope objections — 4A + 2B; five of six findings CONVERGED across channels |
| 3 | **Stop criterion** | — | — | **FIRED** on two Table B rows → ruled by the orchestrator under the standing instruction as owner **item 9**: keep the code-derived-recipient verb; the two rows are the ORDER contract not yet applied to itself. Round-4 criterion sharpened to STOP |
| 4 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round4-codex-plugin.txt` | `08eec164` | needs-attention — R4-A (B, converged), R4-B (A); one scope objection, excluded from the verdict |
| 4 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round4-herdr-shadow.txt` | `62710758` | needs-attention — R4-A (A, converged), R4-C (B) |
| 6 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round6-codex-plugin.txt` | `67b04075` | needs-attention — R6-A (converged), R6-C, R6-D; **111 pipeline cases executed; no product finding** |
| 6 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round6-herdr-shadow.txt` | `41a51070` | needs-attention — R6-A (converged), R6-B (converged), R6-D (converged), R6-E; **full pipeline + boundary probes; no product finding** |
| impl | **ERRATUM 1** | PR #224 @ `e66783b8` | — | `src/core/runtime-skill-digests.json` missing from Deliverables; editing a vendored `SKILL.md` moves its digest. 13 tests red. Spec fixed docs-only on the implementation branch; rows 19 → 20 |
| 6 | **WEIGHTED CLOSURE** | — | — | **LOOP CLOSED.** Zero product findings on both channels; machinery fixed in-surface; no round 7. Spec → `Ready` |
| 5 | Codex plugin | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round5-codex-plugin.txt` | `3d80d955` | needs-attention — R5-A (A, converged), R5-B (B, **unlicensed change caught**); two objections routed |
| 5 | Hermetic Codex shadow | `docs/specs/logbook/2026-09-05-audit-d-gate-raw-round5-herdr-shadow.txt` | `6b3857a2` | needs-attention — R5-A (A, converged), R5-C (A, product), R5-D (dissolved), R5-E (C) |
| 4→5 | **OWNER RULING (direct)** | `docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md` | ruled on `197cd797` | **(a) refuse at the output**, plus R4-B and R4-C. (c) successor, not filed; (b) rejected. Table B unfrozen for one pass; applied as steps 2, 5 and 7 and item 10. Round 5 = closing confirmation |
| 4 | **Stop criterion (final)** | — | — | **FIRED — Table B FROZEN.** R4-A/B/C PARKED for the owner; brief at `docs/specs/logbook/2026-09-05-audit-d-owner-brief-derived-headers.md`. WP stays `Draft`. Non-Table-B machinery fixes applied |
