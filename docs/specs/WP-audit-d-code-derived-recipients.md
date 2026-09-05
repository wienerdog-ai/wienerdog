---
id: WP-audit-d-code-derived-recipients
title: Split create_draft into two code-derived-recipient verbs
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0026, ADR-0031]
epic: audit-close
---

# WP-audit-d-code-derived-recipients: Split `create_draft` into two code-derived-recipient verbs

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

## Context (read this, nothing else)

Wienerdog is a file-writing tool: it starts no daemon, no server, and no process
that outlives its job (**ADR-0004**). The one long-ish-lived process it does start
is the **capability broker** — a per-job stdio child of a routine's `claude -p`
that holds the Google OAuth credentials the model never sees and exposes a fixed,
schema-validated **verb** table over MCP (ADR-0026). It dies with its parent. This
WP changes which verbs exist; it starts nothing.

Three shipped **routines** reach Google through the broker: `daily-digest`,
`inbox-triage`, `weekly-review`. Each routine's profile declares an exact
`brokerVerbs` allowlist, and the broker enforces it server-side as well
(`registry.js:53` rejects an undeclared verb before any dispatch). Verbs are
grouped into **capability classes** (`READ`, `DRAFT`, `SEND`, `CALENDAR_WRITE`);
the broker loads only the least-scope credential each class needs.

**The defect this WP closes (audit GROUP D, ruled 2026-08-05).** The SEND verb
`send_digest_to_self` is safe *by construction*: its input schema has no `to`,
`cc` or `bcc` field at all, and the broker resolves the recipient server-side to
the authenticated account. `create_draft` is the asymmetry — it takes a free `to`
string constrained only by length and "no CR/LF", and no grant gates the DRAFT
class. Both routines that hold it consume **untrusted input**: `weekly-review`
reads the vault snapshot, `inbox-triage` reads inbound mail. Untrusted content and
an outward-addressable capability share a session with nothing between them (T4a).
Driven at the pinned base — see Current state for the pasted run — a model-supplied
`attacker@evil.example` reaches the draft's `To:` header with the grant check
consulted **zero** times.

**A mandatory-self rule was REJECTED, with reason:** the two consumers need
different recipients — weekly-review drafts to the account owner, inbox-triage
drafts replies to a message's author. One rule cannot serve both. **Gating the
DRAFT class behind a grant was also REJECTED:** a grant is one yes/no made months
earlier, and once given, any address flows again. The project's ratified move is to
remove the surface rather than gate it. So this WP **splits the verb** into two,
each of which takes no address at all, and **deletes** `create_draft`.

**Named residual, accepted:** a reply draft's recipient is bound to the message it
replies to, so an attacker who mails the user can obtain a draft addressed to
themselves. That is inherent to replying, is strictly narrower than today (where
any address at all is reachable), and every draft passes the user's eyes before it
is ever sent — the routines have no send verb.

## Current state

Everything below was re-measured at `8c52808f` (`origin/main`, 2026-09-05); ranges
were checked at both ends.

**The verb table** — `src/gws/broker/verbs.js`, eight frozen verb records:

- `create_draft` is `verbs.js:154-172`. Its schema (`:160-169`) is
  `required: ['to','subject','body']` with `to: {type:'string', maxLength:320,
  pattern: NO_CRLF}` at `:165`, `subject` the same shape at 512 (`:166`), `body`
  `maxLength: 64 * KB` (`:167`). `NO_CRLF` is `'^[^\\r\\n]*$'` at `:21`. Cap:
  `limits: { maxCallsPerRun: 10 }` at `:170`. Handler at `:171` forwards
  `args.to` straight into `gmail.draft`.
- `send_digest_to_self` is `verbs.js:174-206` — the model for the new verbs. Its
  zero-address-input comment is `:181-183`; its cap is
  `maxCallsPerRun: 2` at `:193`; its self-resolve is `:197-201`:
  `services.gmail.users.getProfile({userId:'me'})`, then a fail-loud
  `WienerdogError` when the result carries no `@`.
- `gmail_read`'s id schema at `:69` is
  `{ type: 'string', maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' }`.

**The grant gate and the counter** — `src/gws/broker/registry.js`. The per-run
counter increments at `:69` (`checkAndCount`), *before* the grant gate at `:71`,
which fires only for `CAPABILITY_CLASS.SEND`. `checkAndCount`
(`src/gws/broker/limits.js:22-28`) throws when the cap is exhausted and otherwise
increments — **there is no refund on a failed call**, so a transient error burns a
slot. `registry.js:60-62` refuses a verb whose backing *service* object is absent.

**Gmail helpers** — `src/gws/gmail.js`. `assertHeaderSafe` (`:18-23`) throws on any
CR/LF in a header value. `header(headers, name)` (`:31-35`) reads one header
case-insensitively. `read` (`:106-123`) returns `{id, from, to, subject, date,
body}` — **no `threadId`, no `Reply-To`, no `Message-ID`, no `References`**.
`draft` (`:131-142`) posts `{ message: { raw } }` to `drafts.create` — **no
`threadId`**. `buildMime` (`:150-160`) emits `From?`, `To`, `Subject`,
`Content-Type`, blank line, body — each header value through `assertHeaderSafe`.
Exports at `:162`. **`gmail.draft` has exactly one caller in the tree**
(`verbs.js:171`); the attended `gws gmail draft` CLI surface described in
`docs/ARCHITECTURE.md:160` no longer reaches it.

**Per-class method routing** — `src/cli/gws-broker.js`. `compositeServices`
(`:53-82`) builds one gmail façade whose methods route per class: `messages.list`,
`messages.get` **and `getProfile` come from the READ credential** (`:63-70` — the
comment there records that `gmail.send` cannot call `getProfile`);
`drafts.create` comes from DRAFT (`:76-79`); `messages.send` from SEND.
`assembleRegistry` derives the classes to load from the profile's verbs alone
(`:95`) and refuses a verb whose class did not load (`:121-128`).

Measured consequence, pasted (run at `8c52808f`):

```text
DRAFT-only  -> getProfile? undefined | messages? undefined | drafts.create? function
READ+DRAFT  -> getProfile? function | messages.get? function | drafts.create? function | messages.send? undefined
```

**So a DRAFT-only routine cannot resolve the account address and cannot read a
message.** `weekly-review` is DRAFT-only today. This is why Table A gives both new
verbs an `extraClasses` declaration.

**The allowlists** — `src/core/runtime-profile.js`:
`inbox-triage` `brokerVerbs` is `['gmail_search','gmail_read','create_draft']`
(`:103`); `weekly-review` is `['create_draft']` (`:115`), with a comment naming
the verb at `:113`. `composeClaudeArgs` emits
`--allowedTools mcp__wienerdog-broker__<verb>,…` — never a wildcard.

**The defect, driven** (mocked Gmail client, `grantCheck` returning `false`):

```text
create_draft.capabilityClass = DRAFT
create_draft.inputSchema.properties.to = {"type":"string","maxLength":320,"pattern":"^[^\\r\\n]*$"}
send_digest_to_self has a `to` property?  false
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

**The consumer sweep** (system `grep` over `src skills templates tests docs bin`,
every path passed literally, at `8c52808f`). Every `create_draft` occurrence:
`src/core/runtime-profile.js:103,:113,:115`; `src/gws/broker/verbs.js:154,:155`;
`skills/wienerdog-inbox-triage/SKILL.md:13,:24,:33`;
`skills/wienerdog-weekly-review/SKILL.md:13,:30,:35`; `docs/GLOSSARY.md:36`;
`docs/adr/0026-gws-capability-broker.md:152`; `docs/THREAT-MODEL.md` (prose, not
the token); `FIX-PLAN.md:525,:541`; and five test files
(`tests/unit/broker-verbs.test.js`, `broker-registry.test.js`,
`broker-wiring.test.js`, `routine-runtime.test.js`,
`routines-skill-structure.test.js`), plus `docs/specs/done/` and
`docs/security-audit/` records. **No other caller exists** — in particular
`tests/scenarios/broker-e2e/` names no verb: `allowedMethodsFor`
(`run-broker-e2e.js:63-78`) derives the permitted Google methods from each verb's
`apiMethod` string, and `gmail.users.getProfile` is exempted at `:256`.

**Docs that assert the thing that is not yet true.** `docs/THREAT-MODEL.md:140`
and `:142` both state that a hijacked model "cannot forge a grant, widen a scope,
**name a new recipient**, or reach a disallowed Google method". For SEND that is
true; for drafts it is false today, and this WP is what makes it true.
`docs/adr/0026-gws-capability-broker.md:152-153` still describes `create_draft` as
the DRAFT verb; `docs/GLOSSARY.md:36` names it as an example broker verb.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file itself (the status flip),
     package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/broker/verbs.js | delete the `create_draft` record; add `create_draft_to_self` and `create_reply_draft` exactly per **Table A**; add the `extraClasses` field and export `requiredClassesFor` (Exact contracts) |
| modify | src/gws/gmail.js | extend `buildMime` and `draft` and add `replyTarget`, all per Exact contracts; extend the `module.exports` list |
| modify | src/cli/gws-broker.js | `:95` and `:121-128` route through `requiredClassesFor` so `extraClasses` decides which credentials load and which are refused (Exact contracts) |
| modify | src/core/runtime-profile.js | `inbox-triage` → `['gmail_search','gmail_read','create_reply_draft']`; `weekly-review` → `['create_draft_to_self']`; update the `:113` comment to name the new verb |
| modify | skills/wienerdog-inbox-triage/SKILL.md | name `create_reply_draft`; the Draft section says the reply goes to the message id, not to an address |
| modify | skills/wienerdog-weekly-review/SKILL.md | name `create_draft_to_self`; delete "with the user's own address as `to`" |
| modify | docs/GLOSSARY.md | line 36's example list: `create_draft` → `create_draft_to_self` |
| modify | docs/THREAT-MODEL.md | T4a only: `:138` gains the drafts sentence; the named residual is added as its own paragraph after `:140`'s (Exact contracts) |
| modify | docs/adr/0026-gws-capability-broker.md | §2's draft bullet (`:152-153`) and a new **Amendment 2** appended after the Amendment 1 block (Exact contracts) |
| modify | tests/unit/broker-verbs.test.js | the verb-table pin, the draft tests, and the five new identities of **Table C** |
| modify | tests/unit/broker-registry.test.js | it uses `create_draft` as its sample allowlisted verb (`:38,:42,:50,:64,:68`) |
| modify | tests/unit/broker-wiring.test.js | the pinned per-routine verb lists (`:83,:84,:104,:107`) |
| modify | tests/unit/routine-runtime.test.js | the pinned `--allowedTools` string (`:119`) |
| modify | tests/unit/routines-skill-structure.test.js | the inbox-triage verb assertion (`:147,:148`) |
| create | tests/red-proofs/audit-d-code-derived-recipients.proofs.json | the eight declarations of **Table C** |

### Exact contracts

**`extraClasses` on a verb record.** A new optional frozen array field naming
capability classes whose credentials must ALSO load for the verb to work — it never
includes the verb's own `capabilityClass`, and it does not change which class
gates the verb (both new verbs stay `DRAFT`, so `registry.js:71` still never fires
for them).

**`verbs.js` gains one exported pure helper** so the rule above has a testable
seam (`compositeServices` is already exported from `src/cli/gws-broker.js` for
exactly this reason, `gws-broker.js:167-170`):

```js
/** Every capability class whose credential must load for these verbs to work:
 *  the union of each verb's `capabilityClass` and its `extraClasses`, sorted,
 *  deduplicated. Throws WienerdogError on an unknown verb name (fail closed).
 *  @param {string[]} verbNames @returns {string[]} */
function requiredClassesFor(verbNames)
```

`src/cli/gws-broker.js` then uses it in two places: `:95`'s class derivation
becomes `requiredClassesFor(profile.brokerVerbs)`, and `:121-128`'s refusal covers
every class in `requiredClassesFor([name])`, reusing the existing sentence with the
missing class named: `` `the ${cls} credential is not available in this run` ``.

**`gmail.buildMime(m)`** gains two optional string fields, `inReplyTo` and
`references`. Emitted order becomes: `From` (if given), `To`, `Subject`,
`In-Reply-To` (if non-empty), `References` (if non-empty), `Content-Type`, blank
line, body. Each new value goes through `assertHeaderSafe` exactly as `To` and
`Subject` do. **With both absent the bytes are identical to today's.**

**`gmail.draft(services, opts)`** gains an optional `threadId`; when non-empty the
request body becomes `{ message: { raw, threadId } }`, otherwise it is unchanged.
`opts` also carries `inReplyTo` / `references` through to `buildMime`.

**`gmail.replyTarget(services, { id })`** — new, exported. Calls
`services.gmail.users.messages.get({ userId:'me', id, format:'metadata',
metadataHeaders: ['Reply-To','From','Subject','Message-ID','References'] })` and
returns `{ to, subject, threadId, inReplyTo, references }` derived per **Table B**.
It throws a `WienerdogError` with the fixed message
`could not determine one reply address on that message — no draft was created`
when Table B's recipient rule is not satisfied. It never reads the message body,
and it never accepts an address from its caller.

**`create_draft_to_self`'s handler** mirrors `verbs.js:197-201` exactly: resolve
via `getProfile`, and when the result carries no `@`, throw
`could not determine your Google account address — no draft was created`.
The resolved address is the only value that ever reaches `to`.

**`docs/THREAT-MODEL.md` T4a.** At `:138`, after the `send_digest_to_self`
sentence, add: *"Drafting is the same shape: the two draft verbs also take no
recipient — `create_draft_to_self` resolves the account owner server-side, and
`create_reply_draft` derives its single recipient from the headers of the message
it replies to. No broker verb accepts an address from the model."* Then add, as
its own paragraph immediately after `:140`'s residual paragraph:

> **Residual (accepted) — a reply draft's recipient is the message it replies to.**
> `create_reply_draft` derives its one recipient from the replied-to message's
> `Reply-To` (else `From`) header, both of which the message's author chooses. An
> attacker who can mail the user can therefore obtain a *draft* addressed to
> themselves, with content the hijacked model wrote. This is inherent to replying
> and is strictly narrower than a free `to` field: the recipient must already have
> mailed the user, the draft carries exactly one address and no `Cc`/`Bcc`, the
> routines hold no send verb, and every draft passes the user's eyes in Gmail
> before it can leave. Revisit only if a routine ever gains an unattended send to
> a non-self address.

`docs/THREAT-MODEL.md:140` and `:142` both already claim a hijacked model cannot
"name a new recipient". **Neither sentence needs editing** — this WP is what makes
them true; before it, they overclaim for drafts (Dispatch precondition item 6).
Nothing else in `docs/THREAT-MODEL.md` is touched.

**`docs/adr/0026-gws-capability-broker.md`.** Replace §2's draft bullet
(`:152-153`) with the two new verbs and their API methods, and append after the
Amendment 1 block:

> ### Amendment 2 (2026-09-05) — drafts are zero-address-input too
>
> §4 made the unattended SEND verb zero-address-input; the DRAFT class kept a free
> `to` field, ungated, on two routines whose input is untrusted (the audit's group
> D). **Decision:** `create_draft` is **deleted** and replaced by two verbs that
> take no address — `create_draft_to_self` (recipient = the `getProfile`-resolved
> account owner) and `create_reply_draft` (recipient derived from the replied-to
> message's headers). §4's zero-address-input rule therefore holds for **every**
> outward-addressing verb, DRAFT and SEND alike, and no free-address surface
> remains to gate — which is why the rejected alternative, gating DRAFT behind a
> grant, was not taken: a grant is one yes/no made months earlier, after which any
> address flows again. Both new verbs declare `extraClasses: ['READ']` because
> `getProfile` and `messages.get` route to the READ credential
> (Amendment 1's sibling decision, `src/cli/gws-broker.js:63-70`); the model's
> reachable surface is unchanged, since each routine's verb allowlist still names
> only its own verbs. Accepted residual: a reply draft's recipient is chosen by the
> replied-to message's author — see `docs/THREAT-MODEL.md` T4a.
> Implemented by **WP-audit-d-code-derived-recipients**.

## Contract reference

The ADR-0031 activation trigger fires on four of seven: (i) the verb interface
shape changes; (iii) input-schema acceptance changes; (vi) both routines and the
E2E harness inherit the contract; (vii) the same contract is mirrored in
`verbs.js`, two profile allowlists, two `SKILL.md` bodies, the ADR, the glossary,
the threat model and five test files.

### Table A — canonical: the broker verb table after this WP

Nine verbs. The four non-gmail rows are listed so the universal in criterion 1
quantifies over a complete table; they are **not** modified by this WP.

| Verb | Class | `extraClasses` | Input schema (`additionalProperties:false`) | Where the recipient comes from | `apiMethod` | `maxCallsPerRun` — and what would move it |
|---|---|---|---|---|---|---|
| `gmail_search` | READ | — | `{query ≤512, max 1..20}` | n/a | `gmail.users.messages.list (+ per-hit messages.get metadata)` | 50 — unchanged by this WP |
| `gmail_read` | READ | — | `{id: string ≤128, pattern ^[A-Za-z0-9_-]+$}` | n/a | `gmail.users.messages.get (format full)` | 50 — unchanged |
| `calendar_list` | READ | — | unchanged | n/a | unchanged | 50 — unchanged |
| `calendar_show` | READ | — | unchanged | n/a | unchanged | 50 — unchanged |
| `drive_search` | READ | — | unchanged | n/a | unchanged | 50 — unchanged |
| `drive_read` | READ | — | unchanged | n/a | unchanged | 50 — unchanged |
| **`create_draft_to_self`** (NEW) | DRAFT | `['READ']` | `required ['subject','body']`; `subject {string, ≤512, NO_CRLF}`, `body {string, ≤64*KB}` — **no address key of any kind** | `gmail.users.getProfile({userId:'me'}).data.emailAddress`, server-side | `gmail.users.drafts.create (recipient = server-resolved self via gmail.users.getProfile)` | **3** — weekly-review drafts at most one self-copy per run (its `SKILL.md` has one optional draft step), and the counter increments pre-call with **no refund** (`registry.js:69` → `limits.js:22-28`), so each transient failure burns a slot: 1 intended + 2 retries. Moves if a routine legitimately needs more than one self-draft per run, or if `checkAndCount` ever refunds a failed call. |
| **`create_reply_draft`** (NEW) | DRAFT | `['READ']` | `required ['id','body']`; `id: {string, ≤128, pattern ^[A-Za-z0-9_-]+$}` (the same shape as `gmail_read`, `verbs.js:69`), `body {string, ≤64*KB}` — **no address key, and no subject key** | Table B, from the message the `id` names | `gmail.users.drafts.create (recipient/threading from gmail.users.messages.get metadata)` | **10** — re-decided, and equal to today's `create_draft` value (`verbs.js:170`). `gmail_search`'s `max` is capped at 20 (`verbs.js:52`) and inbox-triage's `SKILL.md` asks for 20, so at most 20 messages are candidates; the same no-refund counter applies; and each call's blast radius is bounded by construction, since the recipient must already have mailed the user. A run with more than 10 repliable messages stops at 10 — today's behaviour, unchanged. Moves if `gmail_search`'s cap rises, if the triage window widens, or if the counter gains a refund. |
| `send_digest_to_self` | SEND | — | `required ['subject','body']` — no address key (`verbs.js:184-192`) | server-resolved self (`verbs.js:197-201`) | `gmail.users.messages.send (recipient = server-resolved self)` | 2 — **out of scope**, unchanged |
| ~~`create_draft`~~ | — | — | **DELETED** | — | — | — |

**Why deleted rather than merely de-allowlisted:** after this WP the verb has zero
callers anywhere in the tree (see the sweep in Current state), and a record left in
the frozen table is a free-address surface one allowlist edit away from reachable.
Criterion 1's universal is only true of the deleted state.

### Table B — canonical: how `create_reply_draft` derives everything from the source message

Every value below comes from the fetched message; **nothing in this table can be
influenced by the verb's arguments except which message is fetched.**

| Fact | Rule | On violation |
|---|---|---|
| Header precedence | `Reply-To` if its value is non-empty after trimming, else `From` | both empty → refuse |
| Candidate extraction | all `<…>` groups in the chosen value; if there are none, the whole trimmed value is the single candidate | — |
| Candidate count | must be **exactly one** | 0 or ≥2 → refuse |
| Address acceptance | the trimmed candidate must be ≤320 chars and match `^[^\s<>,;:"\\]+@[^\s<>,;:"\\]+\.[^\s<>,;:"\\]+$` | no match → refuse |
| Recipient (`to`) | that one address, and only it. **No `Cc`, no `Bcc`, ever** | — |
| Subject | the source `Subject`, prefixed with `Re:` and one space unless it already matches `/^re:/i`; then truncated to the first 512 characters (the same ceiling as a model-supplied subject, Table A) | — |
| `threadId` | the fetched message's `threadId`, passed to `drafts.create` | absent → omit it; still draft |
| `In-Reply-To` | the source `Message-ID`, verbatim | absent → omit |
| `References` | the source `References` (when non-empty) followed by the source `Message-ID`, space-joined | no `Message-ID` → omit both this and `In-Reply-To` |
| Any CR/LF in a derived value | `assertHeaderSafe` (`gmail.js:18-23`) throws before the request is built | zero `drafts.create` calls |
| "Refuse" means | throw the fixed `WienerdogError` named in Exact contracts, **with zero `drafts.create` calls** | — |

Two consequences worth stating, because a reviewer will ask:

- **The address rule is deliberately fail-closed and narrower than RFC 5322.** A
  quoted local part, an address literal (`user@[192.0.2.1]`), or a dotless domain
  is refused and no draft appears. This is the one field an attacker fully
  controls; a value the broker cannot reason about does not get a draft.
- **This package makes no claim about how Google *accepts* a threaded draft.** The
  contract is the request the broker *builds*; Gmail's own threading acceptance
  rules were not measured here and are not asserted anywhere in this spec.
  Acceptance criterion 5 is about the request, against a stubbed client — the
  posture every existing broker test already uses.

### Table C — canonical: the RED proofs

One suite: `tests/unit/broker-verbs.test.js`. Six identities, nine declarations.
Each identity carries its band marker in **every** assertion message, so each
declaration's `signal` is a string the author writes rather than a guess.
`scripts/red-proofs.js`'s `evaluateRed` requires the observed own-body failing set
to **equal** `expectRed`, so **measure each set by running the lane — never predict
it.** The mutations below are stated semantically because they target code that
does not exist yet; the implementer writes the byte-exact `find`/`replace`.

| Identity — exact top-level test name | Signal | Proof id | Criterion | The mutation that must redden it |
|---|---|---|---|---|
| `broker-verbs: [AUD-D1] create_draft_to_self addresses the server-resolved account and refuses when it cannot resolve one` | `[AUD-D1]` | `self-recipient-from-args` | 2 | in `create_draft_to_self`'s handler, use an address taken from `args` (falling back to a literal) instead of the `getProfile`-resolved one |
| ″ | `[AUD-D1]` | `self-resolve-failure-swallowed` | 2 | replace the fail-loud throw on an unusable `getProfile` result with a literal fallback address |
| `broker-verbs: [AUD-D2] create_reply_draft addresses exactly the one address derived from the replied-to message` | `[AUD-D2]` | `reply-recipient-not-derived` | 3 | in `replyTarget`, replace the header-derived recipient with the first address found in the caller-supplied `body` |
| `broker-verbs: [AUD-D3] create_reply_draft creates no draft when the message cannot be fetched or yields no single usable address` | `[AUD-D3]` | `reply-candidate-count-ungated` | 4 | replace Table B's exactly-one-candidate requirement with "take the first candidate" |
| ″ | `[AUD-D3]` | `reply-address-pattern-dropped` | 4 | remove Table B's address-acceptance test from `replyTarget` |
| ″ | `[AUD-D3]` | `reply-fetch-failure-drafts-anyway` | 4 | wrap `messages.get` in a catch that continues with an empty header set |
| `broker-verbs: [AUD-D4] a reply draft is threaded to its source message, and carries no reply headers when the source has no Message-ID` | `[AUD-D4]` | `threading-dropped` | 5 | drop `threadId` from the `drafts.create` request body |
| `broker-verbs: [AUD-D5] a CR/LF in any code-derived header value produces zero drafts.create calls` | `[AUD-D5]` | `reply-headers-unasserted` | 6 | bypass `assertHeaderSafe` on `buildMime`'s new `In-Reply-To` / `References` lines |
| `broker-verbs: [AUD-D6] requiredClassesFor names every credential a verb needs, including its extraClasses` | `[AUD-D6]` | `extra-classes-dropped` | 8 | in `requiredClassesFor`, union only each verb's own `capabilityClass` and ignore `extraClasses` |

`requiredClassesFor` lives in `verbs.js` (Exact contracts) precisely so `[AUD-D6]`
belongs to this suite — one declaration file names one `suite`, and a second
declaration file would be machinery guarding machinery.

**Criteria 1, 7, 9 and 11 carry no declaration, deliberately.** 1 is a structural
pin over the verb table, checked mechanically and non-vacuously by V5; 7 and 9 are
pins on code this WP does not modify (`registry.js:71`, `composeClaudeArgs`), so
there is no branch a mutation could invert that Table C's rows do not already move;
11 is `N/A`.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table A, B or C. A review finding updates
the table **and** every mirror below in one pass; any new mirror found in review is
added here on the spot.

- [ ] **Table A** ← Deliverables rows for `verbs.js`, `runtime-profile.js`, both `SKILL.md`s, `docs/GLOSSARY.md`, `docs/adr/0026-…` (Amendment 2's verb names), and the four test rows
- [ ] **Table A** ← acceptance criteria 1, 2, 7, 8, 9
- [ ] **Table A** ← verification steps V4 (the deleted name) and V5 (the address-field universal)
- [ ] **Table A** ← Current state's "The verb table" and "The allowlists" paragraphs
- [ ] **Table A** ← Exact contracts' `extraClasses` and `create_draft_to_self` paragraphs
- [ ] **Table B** ← Deliverables row for `src/gws/gmail.js`; Exact contracts' `replyTarget`, `buildMime` and `draft` paragraphs
- [ ] **Table B** ← acceptance criteria 3, 4, 5, 6
- [ ] **Table B** ← the T4a residual paragraph quoted in Exact contracts (the `Reply-To`-else-`From` sentence)
- [ ] **Table C** ← the Deliverables row for the `.proofs.json` file, acceptance criterion 10, and verification step V3
- [ ] **Table A** ← Dispatch-precondition items 1 (`extraClasses: ['READ']`), 3 (the deletion) and 5 (the two caps)
- [ ] **Table B** ← Dispatch-precondition items 4 (header precedence) and 7 (the address rule)

## Implementation notes & constraints

- **Zero new npm dependencies.** Plain Node ≥ 18, JSDoc types, no TypeScript, no
  build step — CLAUDE.md's rules apply unchanged.
- **Nothing here starts a process.** ADR-0004 holds: this WP edits verb records and
  the helpers behind them.
- **Do not add a grant.** The DRAFT class stays ungated on purpose; the whole point
  is that there is no longer a free-address surface to gate. `registry.js:71` is
  untouched.
- **Do not widen a scope.** `src/gws/scope-sets.js` is out of scope: DRAFT stays
  `gmail.compose` (`:24`), READ stays as it is. `extraClasses` changes which
  *already-defined* credentials the broker loads, never what any of them contains.
- **`create_reply_draft` takes no subject on purpose.** The subject is derived
  (Table B), which removes one more model-written header for free and matches what
  `skills/wienerdog-inbox-triage/SKILL.md:24-25` already tells the model to write.
- **A reply draft with no `Message-ID` still drafts.** Only the *recipient* rules
  fail loud. Making a missing `Message-ID` fatal would lose a legitimate reply for
  a case with no security content.
- **The E2E harness needs no change, measured.** `allowedMethodsFor`
  (`tests/scenarios/broker-e2e/run-broker-e2e.js:63-78`) derives permitted methods
  by regex over each verb's `apiMethod`, so Table A's two `apiMethod` strings
  (which name `drafts.create` and `messages.get`) admit exactly the right methods,
  and `gmail.users.getProfile` is already exempt at `:256`. That harness is
  maintainer-run and live-only — it is not part of `npm test`, so it carries none
  of this WP's acceptance criteria.
- When uncertain: choose the simpler option and record it in the PR under
  "Decisions made". Do NOT expand scope to resolve ambiguity.

## Security checklist

- [ ] N/A — no untrusted identifier flows into a filesystem path or a shell command
      in this WP; nothing here touches the filesystem or spawns anything.
- [ ] Every value the broker places in an RFC-2822 header — the derived recipient,
      the derived subject, `Message-ID`, `References` — passes through
      `assertHeaderSafe` (`src/gws/gmail.js:18-23`) before the MIME is built, so a
      CR/LF smuggling an extra `Bcc:` produces zero `drafts.create` calls
      (criterion 6). The rule is that **no** header value bypasses it; the
      exception set is empty.
- [ ] No verb input schema declares an address-bearing property — the universal
      quantifies over Table A and is checked mechanically by V5.

## Acceptance criteria

1. [ ] `Object.keys(VERBS)` is exactly Table A's nine live names, `create_draft`
       absent; and no verb whose `service` is `'gmail'` declares any of
       `to, cc, bcc, from, recipient, reply_to, replyTo, address` in
       `inputSchema.properties`. (V1, V4, V5)
2. [ ] `create_draft_to_self` addresses the draft to the `getProfile`-resolved
       account address and to nothing else; an argument object carrying any
       address key is schema-rejected with zero Google calls; a `getProfile`
       result with no usable address creates no draft and raises the fixed message
       from Exact contracts. (V1 — identity `[AUD-D1]`)
3. [ ] `create_reply_draft` addresses the draft to the one recipient derived per
       Table B; the MIME carries exactly one `To` and no `Cc`/`Bcc`; an address
       written into `body` reaches no header. (V1 — `[AUD-D2]`)
4. [ ] When `messages.get` fails, or Table B's derivation yields zero or ≥2
       candidates, or the candidate fails Table B's address rule — zero
       `drafts.create` calls and the fixed refusal message. (V1 — `[AUD-D3]`)
5. [ ] The reply draft's `drafts.create` request carries the source `threadId`,
       and its MIME carries `In-Reply-To` and `References` per Table B when the
       source has a `Message-ID`; with no `Message-ID` the MIME is byte-identical
       to a non-reply draft's. (V1 — `[AUD-D4]`)
6. [ ] A CR/LF in any Table B-derived value produces zero `drafts.create` calls.
       (V1 — `[AUD-D5]`)
7. [ ] Both new verbs are `CAPABILITY_CLASS.DRAFT` and are never grant-gated:
       `registry.js:71`'s gate still fires only for SEND, and a `grantCheck` that
       always returns `false` does not change either verb's outcome. (V1)
8. [ ] `requiredClassesFor(['create_draft_to_self'])` and
       `requiredClassesFor(['create_reply_draft'])` each name both `DRAFT` and
       `READ`, and an unknown verb name throws; with the READ credential
       unavailable, `create_draft_to_self` is refused with the class-unavailable
       message before any Google call. (V1 — `[AUD-D6]`)
9. [ ] `composeClaudeArgs` emits, for `inbox-triage`,
       `mcp__wienerdog-broker__gmail_search,mcp__wienerdog-broker__gmail_read,mcp__wienerdog-broker__create_reply_draft`
       and, for `weekly-review`, `mcp__wienerdog-broker__create_draft_to_self` —
       exact names, no wildcard. (V1)
10. [ ] Every declaration in Table C reports `PROVEN`. (V3)
11. [ ] Idempotence — `N/A — this WP ships no command and writes nothing outside
        the repo; it changes broker verb definitions and their callers only.`

## Verification steps (run these; paste output in the PR)

```bash
# V1 — full suite (baseline at 8c52808f: tests 2630 / pass 2618 / fail 0 / skipped 12)
node tests/with-temp-root.js tests/run.js

# V2 — lint
npm run lint

# V3 — every Table C declaration PROVEN. At 8c52808f the whole-tree run is
# "37 declared proof(s), 37 selected" all PROVEN; this selection is "0 selected"
# and exits 1 with "VACUOUS: V2 — the selection matched no proof", which is the
# deliverable-absent red. Run the selection AND, once, the whole tree.
node scripts/red-proofs.js --wp WP-audit-d-code-derived-recipients
node scripts/red-proofs.js

# V4 — presence guard FIRST: a grep over a missing file reports zero hits.
# `ls -1` must exit 0 and list all six paths.
ls -1 src/gws/broker/verbs.js src/core/runtime-profile.js src/cli/gws-broker.js \
      skills/wienerdog-inbox-triage/SKILL.md skills/wienerdog-weekly-review/SKILL.md \
      docs/GLOSSARY.md
rc=$?; echo "V4 presence guard exit: $rc"   # 0 required

# V4 — then the sweep: the deleted verb name must appear on NO live product
# surface. Every path is passed literally; the pattern excludes create_draft_to_self
# by requiring a non-word character after the name. MUST print nothing and exit 1.
# Records that legitimately keep the old name are out of the list by design:
# docs/adr/, docs/THREAT-MODEL.md, FIX-PLAN.md, docs/specs/done/, docs/security-audit/.
/usr/bin/grep -aEn 'create_draft($|[^_A-Za-z0-9])' \
  src/gws/broker/verbs.js src/core/runtime-profile.js src/cli/gws-broker.js \
  skills/wienerdog-inbox-triage/SKILL.md skills/wienerdog-weekly-review/SKILL.md \
  docs/GLOSSARY.md
rc=$?; echo "V4 sweep exit: $rc"            # 1 required (0 = a live surface still names it)

# V5 — criterion 1's universal, quantified over Table A. MUST exit 0.
node -e 'const {VERBS}=require("./src/gws/broker/verbs.js");
const ADDRESS_FIELDS=["to","cc","bcc","from","recipient","reply_to","replyTo","address"];
const gmailVerbs=Object.values(VERBS).filter((v)=>v.service==="gmail");
const hits=[];
for(const v of gmailVerbs)for(const k of Object.keys((v.inputSchema&&v.inputSchema.properties)||{}))if(ADDRESS_FIELDS.includes(k))hits.push(v.name+"."+k);
if(gmailVerbs.length===0){console.error("V5 FAIL: no gmail verb found — the check would be vacuous");process.exit(1);}
if(hits.length){console.error("V5 FAIL: address-bearing gmail verb input(s): "+hits.join(", "));process.exit(1);}
console.log("V5 OK: no gmail verb input schema declares an address field ("+gmailVerbs.length+" gmail verbs of "+Object.keys(VERBS).length+" checked)");'
rc=$?; echo "V5 exit: $rc"                  # 0 required
```

V4 and V5 were observed in all three states at design time — deliverable-absent,
compliant and violating; the outputs are in
`docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`. V5's first draft was
over-strict (it red-flagged `calendar_list`'s ISO-timestamp `from`/`to`) and was
narrowed to gmail-service verbs before it entered this spec.

## Out of scope (do NOT do these)

- **`send_digest_to_self` and everything SEND**: its schema, its cap of 2, and the
  grant gate at `src/gws/broker/registry.js:71`. This WP adds no grant and removes
  none.
- **The grant machinery**: `src/gws/broker/grant-store.js`, `wienerdog grant`, the
  broker grant store, and `docs/adr/0026-…` §5.
- **`src/gws/scope-sets.js`** — no OAuth scope changes of any kind.
- **`tests/scenarios/broker-e2e/`** — measured to need no change (Implementation
  notes). Strengthening it to assert draft recipients is a separate WP.
- **`FIX-PLAN.md`** (rows `ST2` / `N-R2` at `:525,:541`) — a dated record of the
  0.10.0 unfreeze, not a live claim; records are not rewritten when the thing they
  recorded changes.
- **`docs/HANDOVER.md`**, `docs/specs/MILESTONES.md`, `docs/specs/done/`,
  `docs/security-audit/` — orchestrator- and record-owned.
- **`docs/ARCHITECTURE.md:160`**, which still describes an attended
  `gws gmail draft` CLI surface that no longer reaches `gmail.draft`. Stale
  independently of this WP — report it under "Discovered issues" in the PR, do not
  fix it.
- Audit groups B (vault-snapshot provenance) and E (`WP-audit-e-ledger-parser-corpus`).

## Dispatch precondition — owner items (each carries a recommendation)

The session may dispatch under these recommendations (standing instruction,
`docs/specs/logbook/2026-09-05-owner-rulings-durability-queue.md`); the owner may
reverse any of them by dated amendment.

1. **`weekly-review`'s broker process gains the READ credential.** Should it?
   *Recommendation: yes.* `getProfile` routes to READ (`gws-broker.js:63-70`;
   measured — with DRAFT alone it is `undefined`), so there is no other way for the
   broker to learn the owner's address. The **model's** reachable surface is
   unchanged: its allowlist still names only `create_draft_to_self`, and
   `registry.js:53` rejects `gmail_search`/`gmail_read` before any dispatch. This
   mirrors the already-ratified `send_digest_to_self` posture.
   *Cost of overruling:* the only alternative is item 2 — there is no third option.
2. **Keep or drop weekly-review's email draft at all?** Dropping it makes the
   routine `mcp:'empty'` — no broker, no credentials, no Google surface for the one
   routine whose input is the vault snapshot. *Recommendation: keep it.* The audit
   ruled a verb split, not a feature removal, and the emailed copy is how the
   weekly review reaches the user away from the machine.
   *Cost of overruling:* `create_draft_to_self` is deleted from this package (one
   new verb instead of two, a materially smaller WP), weekly-review's broker wiring
   is removed, and the user loses the emailed weekly review.
3. **Delete `create_draft`, or leave it defined but off both allowlists?**
   *Recommendation: delete.* Zero callers remain (sweep in Current state), and a
   record left in the frozen table is one allowlist edit from reachable.
   *Cost of overruling:* V5 becomes unsatisfiable and the WP's title claim false;
   the universal would narrow to "no *allowlisted* verb", which nothing enforces.
4. **`Reply-To` before `From` for the derived recipient?** *Recommendation: yes.*
   Both are the author's choice, so the residual is identical either way, and
   honouring `Reply-To` is what every mail client does.
   *Cost of overruling:* `From`-only breaks replies to list and aliased mail for no
   security gain.
5. **The caps, 3 and 10.** *Recommendation: as in Table A, with the movers named
   there.* `create_draft_to_self` = 3 (one intended draft plus two retries against
   a no-refund counter); `create_reply_draft` = 10, re-decided and equal to today's
   value.
   *Cost of overruling:* a cap of 1 on the self-draft loses the week's draft to a
   single transient error — the measured pre-call-increment fact.
6. **T4a's "cannot name a new recipient" claim is false TODAY.**
   *Recommendation: do not patch it separately* — it is corrected by this WP's own
   `docs/THREAT-MODEL.md` deliverable, landing with the code that makes it true.
   *Cost of overruling:* one interim docs commit, and the same two lines rewritten
   again when this WP merges.
7. **Table B's address rule is narrower than RFC 5322** (it refuses quoted local
   parts, address literals and dotless domains, with no draft).
   *Recommendation: accept the narrowing.* This is the one field an attacker fully
   controls; fail closed.
   *Cost of overruling:* a looser pattern admits addresses the broker cannot reason
   about, on the exact field this package exists to constrain.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Conventional commits; PR titled
   `feat(gws): split create_draft into code-derived-recipient verbs (WP-audit-d-code-derived-recipients)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
5. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md`
   and not restated here. `In-Review` marks the START of review: this
   list is complete only when review is.
