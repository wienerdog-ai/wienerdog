---
id: WP-audit-d-code-derived-recipients
title: Split create_draft into two code-derived-recipient verbs
status: Ready
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

**Named residual, accepted:** a reply draft's recipient is **nominated by the
selected message's author** — its `Reply-To`, else its `From` — so an attacker who
mails the user can obtain a draft addressed to themselves, **or to an unrelated
third party they name in `Reply-To`**, who never wrote to the user at all. That is inherent to replying, is strictly narrower than today (where
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
Exports at `:162`. **`gmail.draft` has exactly one PRODUCT caller**
(`verbs.js:171`) — the attended `gws gmail draft` CLI surface described in
`docs/ARCHITECTURE.md:160` no longer reaches it. Its one other caller is
`tests/unit/gws-gmail.test.js:142`, which asserts the decoded MIME
(`/^To: ada@acme\.com\r\n/`, then `Content-Type` immediately followed by the
body). **Measured: that suite passes 9/9 unchanged under the additive extension
below** — with `inReplyTo`, `references` and `threadId` all absent, the emitted
bytes and the `drafts.create` request body are identical to today's — so it is
deliberately NOT a Deliverables row.

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

**The consumer sweep**, at `8c52808f`, in two passes: system `grep -rn` over
`src skills templates tests docs bin`, then a second repo-wide pass (excluding
`node_modules/` and `.git/`) that reaches the root files — which is where
`FIX-PLAN.md` was found. Every `create_draft` occurrence:
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
(`run-broker-e2e.js:63-79`) derives the permitted Google methods from each verb's
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
| modify | src/gws/gmail.js | extend `buildMime` and `draft`; add `replyTarget`, which performs **Table B's ordered steps 0–7**, including the ruled output bound; extend `module.exports` (Exact contracts) |
| modify | src/cli/gws-broker.js | `:95` and `:121-128` route through `requiredClassesFor`; `assembleRegistry` gains an injected `loadServices` **defaulting to `loadCredentialServices`** and is exported (Exact contracts) |
| modify | src/core/runtime-profile.js | `inbox-triage` → `['gmail_search','gmail_read','create_reply_draft']`; `weekly-review` → `['create_draft_to_self']`; update the `:113` comment to name the new verb |
| modify | skills/wienerdog-inbox-triage/SKILL.md | name `create_reply_draft`; the Draft section says the reply goes to the message id, not to an address |
| modify | skills/wienerdog-weekly-review/SKILL.md | name `create_draft_to_self`; delete "with the user's own address as `to`" |
| modify | docs/GLOSSARY.md | line 36's example list: `create_draft` → `create_draft_to_self` |
| modify | docs/THREAT-MODEL.md | T4a only: `:138` gains the drafts sentence; the named residual is added as its own paragraph after `:140`'s (Exact contracts) |
| modify | docs/adr/0026-gws-capability-broker.md | §2's draft bullet (`:152-153`) and a new **Amendment 2** appended after the Amendment 1 block (Exact contracts) |
| modify | tests/unit/broker-verbs.test.js | the verb-table pin (eight names → nine), the draft tests, and every test identity named in **Table C** |
| modify | tests/unit/broker-registry.test.js | it uses `create_draft` as its sample allowlisted verb (`:38,:42,:50,:64,:68`) |
| modify | tests/unit/broker-wiring.test.js | the pinned per-routine verb lists (`:83,:84,:104,:107`) |
| modify | tests/unit/routine-runtime.test.js | the pinned `--allowedTools` string (`:119`) |
| modify | tests/unit/routines-skill-structure.test.js | the inbox-triage verb assertion (`:147,:148`) |
| modify | tests/unit/gws-broker.test.js | identity `[AUD-D6]` — the real assembly path, singleton profiles, three credential states, both the injected and default loader paths, per **Table C** |
| modify | tests/unit/gws-gmail.test.js | identity `[AUD-D7]` — `buildMime`'s CR/LF refusal on every header it emits, including the two reply headers, per **Table C** |
| create | tests/red-proofs/audit-d-code-derived-recipients.proofs.json | the **Table C** rows whose suite is `tests/unit/broker-verbs.test.js` |
| create | tests/red-proofs/audit-d-broker-assembly.proofs.json | the **Table C** rows whose suite is `tests/unit/gws-broker.test.js` |
| create | tests/red-proofs/audit-d-mime-headers.proofs.json | the **Table C** row whose suite is `tests/unit/gws-gmail.test.js` |

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

`src/cli/gws-broker.js` then uses it in **two consumer sites**: `:95`'s class
derivation becomes `requiredClassesFor(profile.brokerVerbs)`, and `:121-128`'s
pre-dispatch refusal covers every class in `requiredClassesFor([name])`, reusing
the existing sentence with the missing class named:
`` `the ${cls} credential is not available in this run` ``.

**Both consumer sites must be exercised through the REAL assembly path, so
`assembleRegistry` takes an injected loader and is exported.** A test that only
drives `requiredClassesFor` proves nothing about them: round 1 reproduced that with
the helper correct and both sites left on the old single-class derivation,
`getProfile` still ran under a missing DRAFT credential and the model saw the
masked `broker verb … failed` instead of the fixed class-unavailable refusal.

```js
/** @param {import('../core/paths').WienerdogPaths} paths
 *  @param {import('../core/runtime-profile').RuntimeProfile} profile
 *  @param {{ loadServices?: (paths, capabilityClass) => Promise<object> }} [deps]
 *    loadServices defaults to `loadCredentialServices`; a test injects a loader
 *    that resolves or rejects per class.
 *  @returns {Promise<import('../gws/broker/server').BrokerRegistry>} */
async function assembleRegistry(paths, profile, deps = {})
```

**The default is resolved ONCE, at entry** —
`const loadServices = deps.loadServices ?? loadCredentialServices;` on the first
line — and **every later line uses that binding**. There is no branch anywhere in
`assembleRegistry` on whether `deps.loadServices` was supplied, and both consumer
sites call `requiredClassesFor` **unconditionally**. This is what makes the
injected cases evidence about production: with one body and one binding, the
no-`deps` path cannot diverge from the tested one. An implementation that instead
branched on `deps` would pass every injected assertion while production stayed
broken, which is exactly what round 3 found.

`assembleRegistry` joins `run` and `compositeServices` in `module.exports`, under
the same "exported for the regression test" comment already at
`gws-broker.js:167-170`. **Injecting the loader was chosen over exporting a pure
"assembly plan"** because a pure plan is one more API that a consumer site can
simply stop calling — the exact failure round 1 found — whereas the injected loader
makes the identity drive the shipped function itself.

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
metadataHeaders: ['Reply-To','From','Subject','Message-ID','References'] })`, then
performs **Table B's steps 0 → 7 IN THAT ORDER** — the ruled output bound included, so it never returns values that would build an over-long line — and returns
`{ to, subject, threadId, inReplyTo, references }`. The order is the contract: step
0's bound runs before every other operation, and step 1's CR/LF scan runs on the
raw values before any trim. It throws a `WienerdogError` at every refusal in Table B, with **two** fixed
messages:

| Refused at | Fixed message |
|---|---|
| steps 0–4 (input bound, CR/LF, selection, grammar, address bound) | `could not determine one reply address on that message — no draft was created` |
| **step 7 (output line bound)** | `the reply's headers would be too long to send — no draft was created` |

The first is the message this verb has carried since round zero and is **not**
changed by the owner's ruling; only step 7's is new, and it is new because the
ruling requires a refusal that did not previously exist. Neither is
`assertHeaderSafe`'s text (`refusing to build email: … contains a line break
(possible header injection)`, `gmail.js:20`), which belongs to step 8 and **must
never be the message a `create_reply_draft` refusal produces** — that is the
property `[AUD-D5]` asserts. It never reads the message body, and it never accepts
an address from its caller.

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

> **Residual (accepted) — a reply draft's recipient is nominated by the author of
> the message it replies to.** `create_reply_draft` derives its one recipient from
> that message's `Reply-To`, else its `From` — both of which the message's author
> chooses. So an attacker who can mail the user can obtain a *draft* addressed to
> themselves, **or, via `Reply-To`, to an unrelated third party who never wrote to
> the user at all**, carrying content the hijacked model composed. This is inherent
> to replying. What the design bounds is the *model*, not the author: the model
> chooses only WHICH message is replied to and can write no address anywhere; the
> draft carries exactly one address and no `Cc`/`Bcc`; the routines hold no send
> verb; and every draft passes the user's eyes in Gmail before it can leave.
> Revisit if a routine ever gains an unattended send to a non-self address.

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
| **`create_reply_draft`** (NEW) | DRAFT | `['READ']` | `required ['id','body']`; `id: {string, ≤128, pattern ^[A-Za-z0-9_-]+$}` (the same shape as `gmail_read`, `verbs.js:69`), `body {string, ≤64*KB}` — **no address key, and no subject key** | Table B, from the message the `id` names | `gmail.users.drafts.create (recipient/threading from gmail.users.messages.get metadata)` | **10** — re-decided, and equal to today's `create_draft` value (`verbs.js:170`). `gmail_search`'s `max` is capped at 20 (`verbs.js:52`) and inbox-triage's `SKILL.md` asks for 20, so at most 20 messages are candidates; the same no-refund counter applies; and each call's blast radius is bounded by construction, since the model chooses only WHICH message is replied to — the address is nominated by that message's author (its `Reply-To`, else `From`) and may be an unrelated third party, but it is never a value the model writes. A run with more than 10 repliable messages stops at 10 — today's behaviour, unchanged. Moves if `gmail_search`'s cap rises, if the triage window widens, or if the counter gains a refund. |
| `send_digest_to_self` | SEND | — | `required ['subject','body']` — no address key (`verbs.js:184-192`) | server-resolved self (`verbs.js:197-201`) | `gmail.users.messages.send (recipient = server-resolved self)` | 2 — **out of scope**, unchanged |
| ~~`create_draft`~~ | — | — | **DELETED** | — | — | — |

**Why deleted rather than merely de-allowlisted:** after this WP the verb has zero
callers anywhere in the tree (see the sweep in Current state), and a record left in
the frozen table is a free-address surface one allowlist edit away from reachable.
Criterion 1's universal is only true of the deleted state.

### Table B — canonical: the ORDER of operations `create_reply_draft` performs

**The contract is an ORDER, not a coverage list.** Round 1 and round 2 landed five
findings on this contract from both channels, and every one of them was a
consequence of the same shape: **parsing before bounding**. Unbounded input let the
grammar's cost depend on the attacker; trimming before the CR/LF check erased a
leading or trailing `\r\n`; prefixing and truncating the Subject to 512 erased a
CR/LF that sat beyond character 512, and a draft was created. Stating a longer list
of accepted and refused shapes cannot fix that, because none of those defects is
about which shapes are accepted. So Table B states the ORDER, each step with its
input and its invariant, and the regexes below are **derived source forms**
validated by an executed case table — not the contract itself.

**Everything below reads only the fetched message. Nothing in this table can be
influenced by the verb's arguments except WHICH message is fetched.** "Refuse"
always means: throw the fixed `WienerdogError` from Exact contracts, with **zero
`drafts.create` calls**.

| Step | Input | Operation | Invariant it establishes | On violation |
|---|---|---|---|---|
| **0. THE BOUND — first, on EVERY raw value the verb reads** | the raw `Reply-To`, `From`, `Subject`, `Message-ID` and `References`, **untrimmed and unselected**, whether or not a later step uses them | each must be ≤ **998** characters (RFC 5322 §2.1.1's line limit) | **NO operation whose cost grows with input length runs before this step.** That is the whole invariant, and it is why the bound is step 0 rather than second: a 4 MB value is refused by a length comparison (**0.012 ms measured**) instead of being scanned, trimmed or matched first | over → refuse |
| **1. CR/LF, on the RAW values** | the same five values, now each ≤998, still untrimmed | test each for `\r` or `\n` **anywhere** | no CR or LF survives into any later step, so no later trim, prefix or truncation can erase one | refuse |
| **2. Recipient selection** | the bounded `Reply-To` and `From` | select `Reply-To` when `/[^ \t]/.test(v)` — **that exact derived form**: one character class, no quantifier, no alternation, linear by construction — else `From` | exactly one header value is under consideration. **The test's form is prescribed, not left open**: a bound on the INPUT is not a bound on the machine that reads it, and a semantically correct blank-check written as `!/^(?:[ \t]+)*$/.test(v)` took **33 962 ms on a 47-octet input** (measured; round 4) | neither has content → refuse |
| **3. Grammar** | the selected value, horizontally trimmed | must match the single-mailbox grammar below, whole | the value is exactly one mailbox; no part of it is ignored | no match → refuse |
| **4. Address bound** | the grammar's capture group | ≤ **320** characters | the recipient fits the field | over → refuse |
| **5. Subject — derived, NEVER truncated** | the raw `Subject` (≤998 characters by step 0, CR/LF-clean by step 1) | horizontally trim. **If the result is empty, the derived subject is the EMPTY string** — no `Re:` on nothing. Otherwise prefix `Re:` and one space unless it already matches `/^re:/i`. **No truncation, no length cap here** | the derivation is a **fixed point**: applying it to its own output changes nothing, for the empty case and the prefixed case alike — so a subject stays stable down a reply chain. Gmail's threading condition is subject **equality**, which an empty subject satisfies against an empty subject | — |
| **6. Threading** | raw `Message-ID`, `References`, and the message's `threadId` | `threadId` → `drafts.create`; `In-Reply-To` = `Message-ID`; `References` = existing `References` (when non-empty) then `Message-ID`, space-joined | the draft threads to its source | no `Message-ID` → omit both headers, still draft; no `threadId` → omit it, still draft |
| **7. THE OUTPUT BOUND — ruled by the owner, 2026-09-05** | **every header line `buildMime` emits for this verb except the fixed `Content-Type`**: `To`, `Subject`, `In-Reply-To`, `References` | for each one that will be emitted, `<name>: <value>` must be ≤ **998 UTF-8 octets** | **what the verb BUILDS conforms, not only what it reads.** No earlier step implies this: the `Subject` prefix costs 9 octets and the `Re:` prefix 4 more; the `References` prefix costs 12 and step 6 appends the parent id; the `In-Reply-To` prefix costs 13, so a 986-octet `Message-ID` passes step 0 and still makes a 999-octet line; and **`To` is here because step 4 bounds 320 CHARACTERS while this bounds OCTETS** — under a code-point reading of step 4 a grammar-accepted address of 247 astral characters plus `aa@b.co` is 254 characters but **995 octets**, a 999-octet `To` line (all measured). The refusal message is fixed and **does not name a field**, so the order the four are checked in is not a contract | refuse |
| **8. `assertHeaderSafe` at `buildMime`** | every header value | `gmail.js:18-23` | **defence in depth only** — step 1 is the check this contract relies on. A CR/LF that reaches step 7 through `create_reply_draft` means step 1 has a hole | throws; zero `drafts.create` calls |

**The two bounds are one rule applied at both ends.** Step 0 refuses input the
verb cannot safely process; step 7 refuses output the verb cannot safely emit.
Round 4 found the second half missing — the package had bounded everything it read
and nothing it wrote — and the owner ruled on 2026-09-05 to close it by refusing
rather than by folding or trimming (see
`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`).

**The two bounds are in DIFFERENT UNITS, deliberately, and that is not an
oversight.** Step 0's input bound is **998 characters** — the ruled owner item 8,
unchanged. Step 7's output bound is **998 UTF-8 octets**. The owner's ruling
licensed a bound at the OUTPUT; it did not touch step 0, so step 0 is left exactly
as ruled.

**Why step 7 must be octets.** RFC 5322 counts octets of the transmitted line, and
`buildMime` (`gmail.js:150-160`) joins its lines and calls `Buffer.from(mime)`,
which encodes UTF-8 — octets are what Gmail receives. The difference is not
cosmetic: a subject of 329 `€` characters is 329 UTF-16 code units but **987
octets**, and would pass a `.length` check while producing a 1000-octet line
(measured). **Step 7 is what makes the transmitted line conform, whatever unit the
input bound counts** — which is why the two units can differ without a gap: a
998-character subject of `€` is 2994 octets, passes step 0, and is refused by
step 7 (measured).

**Whether item 8's input bound should be restated in octets to match is an OPEN
question for the owner**, recorded in
`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`. It has no
product consequence either way once step 7 covers every emitted line.

**Why step 0 is the bound and not the CR/LF scan.** The invariant is *nothing
unbounded before the bound*, and a CR/LF scan of a 4 MB value is itself an
unbounded operation — measured at 0.61 ms, linear, but unbounded. Putting the
bound first makes the invariant absolute and costs nothing. The only observable
difference is which refusal a value that is *both* oversized and CR/LF-bearing
receives; both refuse with zero `drafts.create` calls.

**`src/gws/gmail.js` imposes no length of its own on any header** — `buildMime`
(`:150-160`) asserts CR/LF-freedom and nothing else, and `draft` (`:131-142`)
passes the built MIME through untouched — **so step 7 is the only thing that
bounds an emitted line, and it must therefore cover every line this verb emits.**
It covers four. The two it does not: `Content-Type` is a fixed literal, and
**`From` is never emitted by this verb** — `buildMime` adds a `From` line only when
its argument carries one (`gmail.js:152`), and `replyTarget`'s result shape is
`{ to, subject, threadId, inReplyTo, references }` with no `from`, so the verb has
no data path to it. (`buildMime`'s optional `From` carries no length bound of its
own; that is pre-existing and belongs under "Discovered issues", not here.)

The 512-character ceiling lives **only** on the model-supplied `subject` of
`create_draft_to_self` (Table A), where it is a schema constraint on model input.
**The derived subject has no character cap — it has an octet bound at step 7**,
which is a different rule with a different consumer.

**Trimming, stated once so it cannot drift:** trimming is **horizontal whitespace
only** (`[ \t]`), never CR/LF — which cannot reach a trim, because step 1 already
refused it. It is applied in exactly two places: to the selected recipient value
before step 3, and to the Subject in step 5. Both operands are ≤998 by step 0.

#### The single-mailbox grammar (step 3)

Stated as a grammar; the regexes are derived from it and are validated by the case
table, not the other way round.

```abnf
mailbox     = addr-spec / [ phrase ] angle-addr
phrase      = 1*word              ; whitespace BETWEEN words is optional,
                                  ; and so is whitespace before the "<"
word        = atom / quoted-string
atom        = 1*( %any - SPECIALS - WSP )        ; SPECIALS = < > , ; : " \ @ ( )
quoted-string = DQUOTE *( qtext / "\" CHAR ) DQUOTE   ; MAY contain < > , ;
angle-addr  = "<" [WSP] addr-spec [WSP] ">"      ; and NOTHING after the ">"
addr-spec   = 1*ATEXT "@" 1*DLABEL 1*( "." 1*DLABEL )
ATEXT       = %any - WSP - < > , ; : " \ @ [ ] ( )      ; "." allowed
DLABEL      = ATEXT - "."                               ; so the domain's dots are DETERMINISTIC
```

**Not accepted, by construction and by ruling:** comments, groups, obsolete
forms, address literals (`ATEXT` excludes `[` `]`), more than one `@` (`ATEXT`
excludes `@`, so this is structural, not a check), a dotless domain, and quoted
local parts. That last set is owner item 7's narrowing, unchanged.

**Derived source forms** (`ATEXT`, `DLABEL` and `ADDR` are named above):

| Name | Regex |
|---|---|
| `ATEXT` | `[^\s<>,;:"\\@\[\]()]` |
| `DLABEL` | `[^\s<>,;:"\\@\[\]().]` |
| `ADDR` | `ATEXT+@DLABEL+(?:\.DLABEL+)+` |
| `PHRASE` | `(?:[^\s<>,;:"\\@()]\|[ \t]\|"(?:[^"\\\r\n]\|\\.)*")+` |
| **bare** | `^(ADDR)$` |
| **mailbox** | `^(?:PHRASE)?<[ \t]*(ADDR)[ \t]*>$` |

Two properties of these forms are deliberate and are what the derivation buys:
`DLABEL` excludes `.`, so the domain's dot structure is **deterministic** rather
than a greedy split that can be re-tried at every dot; and `PHRASE`'s three
alternatives begin on **disjoint** characters (atom-char, horizontal space, `"`),
so the alternation never backtracks between them. Both were measured, and both
hold. **Neither is what the contract relies on — step 0's bound is.** The distinction is
load-bearing rather than modest: a claim about a pattern's complexity is
input-, engine- and revision-dependent, and it was re-argued in two consecutive
review rounds before the bound settled it. If the grammar is ever revised, step 0
still holds and these two properties must be re-measured.

#### What this package does and does not claim about Gmail

- **No claim of MEASURED acceptance — but the request now satisfies the documented
  conditions.** Google's threads guide
  (`https://developers.google.com/workspace/gmail/api/guides/threads`, read
  2026-09-05) gives three requirements for a message to join a thread, and states
  that they apply to drafts: `threadId` must be set, `References` and
  `In-Reply-To` must be set, and **the `Subject` headers must match**. Step 6
  satisfies the first two; step 5, by no longer truncating, satisfies the third
  for **every** accepted input — which is why the truncation had to go rather than
  be moved. Acceptance criterion 5 remains a claim about the request the broker
  *builds*, asserted against a stubbed client, the posture every existing broker
  test uses. **Nothing here asserts a live round-trip.** (This bullet was dropped
  by an editing accident in the round-2 rewrite and is restored; the non-claim has
  been the package's position since round zero.)

#### The executed case table (criteria 3, 4, 5 and 6 quantify over this)

**The case table below is the criterion's coverage, and every row in it has been
executed** — as the ordered pipeline, never as a bare regex. Round 4's ruling added
the step-7 rows, the step-7 boundary rows and the subject fixed-point rows; the run
that produced them is in
`docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`. The table states its
own contents; this sentence deliberately does not restate a count, because that
count went stale twice. The implementer's
tests must cover every row; Table C names the identity that owns each family.

| Refused at | Cases |
|---|---|
| **step 0 (the bound)** | a 999-character `From` (one over); a 4 MB whitespace-only `Reply-To` **beside a perfectly valid `From`**; a 4 MB `Subject`; a 4 MB `Message-ID`; a 4 MB `References` |
| **step 1 (CR/LF)** | leading `\r\n`; trailing `\r\n`; embedded `\n`; a bare `\r` smuggling `Bcc:`; a CR/LF in `Subject` **beyond character 512**; a CR/LF in `Message-ID`; a CR/LF in `References`; a CR/LF in a header step 2 will not select |
| **step 2** | empty `From` with no `Reply-To`; a whitespace-only `From` |
| **step 3** | a comment (`alice@example.org (backup <old@example.net>)`); mixed bare + angle (`victim@example.com, Attacker <attacker@example.com>`); several bracketed mailboxes; two bare mailboxes; trailing text after `>`; trailing text on a bare value; a group (`undisclosed-recipients:;`); a named group; an address literal (`user@[192.0.2.1]`); two `@` (`alice@relay@example.org`); a dotless domain (`user@localhost`); a quoted local part (`"john doe"@example.org`) |
| **step 4** | a captured address of 321 characters |
| **step 7 (the output bound) — one-octet boundaries** | `Subject`: an already-`Re:`-prefixed subject of **990** octets → line **999**; a plain subject of **986** octets → derived 990 → line **999**. `References`: **940** octets + a space + a 46-octet parent id → value 987 → line **999**. `In-Reply-To`: a **986**-octet `Message-ID`, which passes step 0 → line **999**. `To`: **247 astral characters + `aa@b.co`** = 247 code points, 995 octets → line **999** |
| **step 7 — the measure is octets, not code units** | a subject of **329 `€`** — 329 UTF-16 code units but 987 octets, derived 991 → line **1000**, which a `.length` check would have passed. And a **998-character** subject of `€` = 2994 octets: it passes step 0 (which counts characters) and is refused here |
| **step 7 — a non-boundary accumulation case, labelled as such** | a 974-octet `References` plus a 46-octet parent id → value **1021**, line **1033**. Kept only to show ordinary thread growth overshooting; it is **not** a boundary, and an earlier draft mislabelled its 1021 as the line length |

| Accepted | Cases |
|---|---|
| bare and angle | `alice@example.org`; `<alice@example.org>` |
| phrases | `Alice Example <…>`; `"Team <east>" <…>`; `"Doe, Jane" <…>`; `"Alice"<…>` (no whitespace before `<`); `Alice "Team <east>" <…>` (atom + quoted word); `"" <…>`; `"a\"b" <…>`; `Dr. Alice O'Brien <…>`; `Alice\t<…>` |
| selection | `Reply-To` taking precedence over `From`; **a ≤998 whitespace-only `Reply-To` beside a valid `From` — falls through to `From` and is ACCEPTED** |
| bounds | surrounding horizontal whitespace; a many-dot domain; a raw value of **exactly** 998 characters |
| **step 7 — accepted at exactly 998 octets** | an already-`Re:`-prefixed subject of **989** octets; a plain subject of **985** octets (derived 989); a **939**-octet `References` plus a 46-octet parent id (value 986 + prefix 12); a **985**-octet `Message-ID`; and a `To` address of **246 astral characters + `U+0800` + `aa@b.co`** — 254 code points, 500 code units, value 994 octets, line **exactly 998** (executed) |
| **subject (step 5)** | **a 900-character `Subject` — accepted, derived length 904, byte-identical to `Re:` plus a space plus the source**; **a `Subject` whose astral character straddles position 512 — accepted, round-trips exactly, no `U+FFFD`**; `Re: already` → unchanged (idempotent) |
| **subject fixed point (step 5, R4-C)** | an **empty** source subject, a **spaces-only** one and a **tabs-only** one each derive the **empty string**; applying the derivation twice changes nothing, for the empty case and for `Hello` → `Re: Hello` → `Re: Hello` |

The last two subject rows are round 3's finding: under the old 512-character
truncation the first was silently cut, and the second produced a lone high
surrogate — `"xxx\ud83d"`, executed — which both breaks Gmail's Subject-match
condition and corrupts the text.

### Table C — canonical: the RED proofs

**Three suites, so three declaration files** — one declaration file names exactly
one `suite`. `[AUD-D1]`–`[AUD-D5]` live in `tests/unit/broker-verbs.test.js`;
`[AUD-D6]` in `tests/unit/gws-broker.test.js`, because criterion 8's contract is
the real assembly path in `src/cli/gws-broker.js` and that suite already drives it
(`gws-broker.test.js:12,:34,:54`); `[AUD-D7]` in `tests/unit/gws-gmail.test.js`,
which already drives `gmail.js` (`:142`, `:161-190`). **The table below states its
own identities and declarations; this sentence deliberately does not restate a
count**, because that count went stale twice.

**Why `[AUD-D7]` had to be split out of `[AUD-D5]`, measured in round 3.** Under
Table B's order, a mutation that removes `buildMime`'s `assertHeaderSafe` is
**unkillable through `create_reply_draft`**: step 1 refuses the CR/LF first, so
correct and mutant code produce the *identical* observable for every field —
`Message-ID` and `References` included. (The round-2 note claiming those two fields
discriminate was wrong, and both channels executed the disproof.) The two
properties are therefore proved where each actually lives: **step 1** through the
verb, and **`assertHeaderSafe`** by calling `buildMime` directly.

**Which identity owns which CR/LF fixture family**, so the `expectRed` sets never
overlap: `[AUD-D5]` owns **every CR/LF case that arrives through
`create_reply_draft`** — all five raw fields, one at a time — and asserts **zero
`drafts.create` calls AND that `buildMime` was never invoked**, which is how "the
error is not `assertHeaderSafe`'s" is checked. `[AUD-D7]` owns **only direct
`buildMime` calls** with a CR/LF in `To`, `Subject`, `In-Reply-To` or `References`,
and never goes through a verb. `[AUD-D3]` owns the **non-CR/LF** refusals — steps
0, 2, 3 and 4 — and carries no CR/LF fixture at all.

**The fourth masking trap, measured.** Step 1's scan cannot be proved on a
*recipient* field. With one generic message covering steps 0–4, dropping step 1's
scan for `From` or `Reply-To` lets the value fall to **step 3**, where the grammar
refuses it anyway — same message, same zero `drafts.create`, `buildMime` still
never called. Correct and mutant are **indistinguishable**. Dropping it for
`Subject`, `Message-ID` or `References` is different: nothing downstream inspects
those, so the mutant reaches **step 8**, `buildMime` runs, and `assertHeaderSafe`
throws its **own** message. **So `step1-scan-drops-a-field` must name a
non-recipient field**, and `drafts.create` alone can never be the discriminator —
it is zero on both sides of every row.

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
| `broker-verbs: [AUD-D2] create_reply_draft addresses exactly the one address Table B's order produces, over every accepted case` | `[AUD-D2]` | `reply-recipient-not-derived` | 3 | **in the `create_reply_draft` HANDLER**, where `args.body` is in scope — override `replyTarget`'s `to` with the first address found in `args.body`. (`replyTarget` takes only `id`, so the mutation cannot live there) |
| `broker-verbs: [AUD-D3] create_reply_draft creates no draft at any refusal in Table B's order — steps 0, 1, 2, 3 and 4` | `[AUD-D3]` | `reply-candidate-count-ungated` | 4 | replace Table B's exactly-one-candidate requirement with "take the first candidate" |
| ″ | `[AUD-D3]` | `reply-grammar-dropped` | 4 | in `replyTarget`, accept the selected value without matching Table B's single-mailbox grammar (take the whole trimmed value as the address) |
| ″ | `[AUD-D3]` | `reply-fetch-failure-drafts-anyway` | 4 | catch the `messages.get` failure and continue with a **literal fallback recipient and subject**, so the mutant DRAFTS where the correct code refuses. (Continuing with an *empty* header set would not do: Table B then refuses on "both empty", producing the same zero-draft observable as correct code — a vacuous proof) |
| `broker-verbs: [AUD-D4] a reply draft is threaded to its source, its subject is the untruncated fixed-point derivation, and every emitted header line is within 998 octets` | `[AUD-D4]` | `threading-dropped` | 5 | drop `threadId` from the `drafts.create` request body |
| ″ | `[AUD-D4]` | `output-bound-removed` | 5 | delete Table B step 7's line-length check entirely — the mutant drafts at every step-7 refused row, so the identity reddens on the refused side while the accepted side is unmoved |
| ″ | `[AUD-D4]` | `output-bound-measured-in-code-units` | 5 | measure step 7 with `String.length` instead of UTF-8 octets — reddens on the `€` subject row, and, wherever step 4 is read as code points, on the astral `To` row as well; both exist to pin the measure |
| ″ | `[AUD-D4]` | `empty-subject-prefixed` | 5 | in step 5, prefix `Re:` even when the trimmed source subject is empty — breaks the fixed point R4-C requires |
| `broker-verbs: [AUD-D5] a CR or LF anywhere in any of the five RAW header values, one field at a time, produces zero drafts.create calls and never reaches buildMime` | `[AUD-D5]` | `step1-scan-drops-a-field` | 6 | remove **`Subject`, `Message-ID` or `References`** — never a recipient field, see the trap above — from step 1's CR/LF scan: the mutant reaches **step 8**, `buildMime` runs, and `assertHeaderSafe` throws its own message, so the identity's "buildMime never invoked" assertion reddens |
| `gws-gmail: [AUD-D7] buildMime refuses a CR or LF in every header it emits, including the two reply headers` | `[AUD-D7]` | `reply-headers-unasserted` | 6 | bypass `assertHeaderSafe` on `buildMime`'s new `In-Reply-To` / `References` lines — reachable only by calling `buildMime` directly, which is why this identity is not in the verb suite |
| `gws-broker: [AUD-D6] on a SINGLETON profile, every class a verb requires is REQUESTED and must have loaded before it dispatches — the real assembly path, three credential states, and the default loader` | `[AUD-D6]` | `extra-classes-dropped-helper` | 8 | in `requiredClassesFor`, union only each verb's own `capabilityClass` and ignore `extraClasses` |
| ″ | `[AUD-D6]` | `extra-classes-dropped-derivation` | 8 | at consumer site `gws-broker.js:95`, derive the classes to load from `VERBS[v].capabilityClass` alone, ignoring `requiredClassesFor` |
| ″ | `[AUD-D6]` | `extra-classes-dropped-refusal` | 8 | at consumer site `gws-broker.js:121-128`, gate the pre-dispatch refusal on the verb's own `capabilityClass` alone — the mutant then dispatches and the model sees the masked `broker verb … failed` |
| ″ | `[AUD-D6]` | `required-classes-gated-on-deps` | 8 | make both consumer sites consult `requiredClassesFor` **only when `deps.loadServices` was supplied**, keeping the single-class derivation otherwise — the mutant passes every injected case and reddens only the no-`deps` assertions |

The `[AUD-D6]` declarations are one per SITE — the helper, each of its consumer
sites, and the `deps`-conditional shape; **Table C above is the list** — because round 1's finding was precisely that a correct helper does not
constrain its callers. They all redden the same identity, which is what makes the
identity's three-state assertion the thing being proved rather than the helper's
return value.

**`expectRed` sets are MEASURED after implementation, never predicted — and a
mutation whose measured set EXCEEDS its declaration is restated, not widened into
the declaration.** The worked case: a "take the first `<…>` candidate" mutation of
step 3 also reddens `[AUD-D2]`'s quoted-display-name row, so its set exceeds
`[AUD-D3]`; the fix is a narrower mutation, because widening the declaration would
make the pair stop distinguishing the two identities — which is the whole reason
`evaluateRed`'s comparison is two-sided.

**Every mutation above must produce a DIFFERENT observable than correct code under
its identity** — `evaluateRed` compares failing sets, so a mutant that lands on the
same refusal the correct code already makes is a vacuous proof, not a red one. Two
traps this contract creates, named so the identity's inputs avoid them: (a) for
`reply-grammar-dropped`, the value must fail Table B's grammar **without
containing CR/LF and within the bound** — `user@[192.0.2.1]` and
`alice@relay@example.org` both qualify — or steps 0/1 refuse the mutant too and the
observable collapses; (b) for `reply-recipient-not-derived`, the `body` must name a
**different** address from the header, or both arms draft to the same recipient;
(c) **the trap round 2 got wrong**: no CR/LF injected through `create_reply_draft`
can ever discriminate a `buildMime` mutation, because step 1 refuses first for
*every* field. That is not a fixture-choice problem with a right answer — it is
structural, and it is why the property moved to `[AUD-D7]` and a direct
`buildMime` call. Round 2 named `Message-ID`/`References` as the discriminating
fields; they are not.

**Criteria 1, 7, 9, 10 and 11 carry no declaration, deliberately.** 1 is a
structural pin over the verb table, checked mechanically and non-vacuously by V5;
7 and 9 are pins on code this WP does not modify (`registry.js:71`,
`composeClaudeArgs`), so there is no branch a mutation could invert that Table C's
rows do not already move; **10 is the meta-check over this table and cannot declare
a proof of itself** — its check is V3, whose own both-directions behaviour is
recorded in the round-zero log; 11 is `N/A`.

### Mirrored Surface Checklist

Every surface in this spec that mirrors Table A, B or C. A review finding updates
the table **and** every mirror below in one pass; any new mirror found in review is
added here on the spot.

- [ ] **Table A** ← Deliverables rows for `verbs.js`, `runtime-profile.js`, both `SKILL.md`s, `docs/GLOSSARY.md`, `docs/adr/0026-…` (Amendment 2's verb names), and the four verb-name-pinning test rows (`broker-registry.test.js`, `broker-wiring.test.js`, `routine-runtime.test.js`, `routines-skill-structure.test.js`)
- [ ] **Table A** ← acceptance criteria 1 (the full-record compare), 2, 7, 8, 9
- [ ] **Table A** ← verification steps V4 (the deleted name) and V5, which pins the nine names, the key-equals-name tie, and all nine complete records
- [ ] **Table A** ← Current state's "The verb table" and "The allowlists" paragraphs
- [ ] **Table A** ← Exact contracts' `extraClasses` and `create_draft_to_self` paragraphs
- [ ] **Table B** ← Deliverables row for `src/gws/gmail.js`; Exact contracts' `replyTarget` (the step order), `buildMime` and `draft` paragraphs
- [ ] **Table B** ← acceptance criteria 3, 4 and 5, which QUANTIFY over Table B's case tables rather than restating them, and 6 (step 1's five raw fields)
- [ ] **Table B** ← Exact contracts' three fixed refusal messages, one per refusing step group
- [ ] **Table B** ← the Gmail-threading bullet (step 5's no-truncation rule is what satisfies the Subject-match condition)
- [ ] **Table B** ← Table C's `[AUD-D3]` / `[AUD-D5]` / `[AUD-D7]` fixture-ownership paragraph
- [ ] **Table B** ← the T4a residual paragraph quoted in Exact contracts (the `Reply-To`-else-`From` sentence)
- [ ] **Table C** ← the Deliverables rows for **all three** `.proofs.json` files and for `tests/unit/gws-broker.test.js` and `tests/unit/gws-gmail.test.js`, acceptance criterion 10, and verification step V3
- [ ] **Table B** ← the two "consequences" bullets under Table B (the whole-value-grammar rationale and the fail-closed narrowing)
- [ ] **Table B** ← the `[AUD-D2]` and `[AUD-D3]` identity names in Table C, and the masking-trap note beneath it
- [ ] **Table B** ← Context's "Named residual" paragraph (the `Reply-To`-else-`From` nomination claim)
- [ ] **Table A** ← Table A's cap-10 rationale, which restates the nomination claim
- [ ] **Table A** ← Dispatch-precondition items 1 (`extraClasses: ['READ']`), 3 (the deletion) and 5 (the two caps)
- [ ] **Table B** ← Dispatch-precondition items 4 (step 2's header precedence), 7 (the grammar's narrowing), 8 (step 0's uniform input bound) and **10 (step 7's output bound, RULED)**

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
- **A reply draft with no `Message-ID` still drafts**, with both reply headers
  omitted: making a missing `Message-ID` fatal would lose a legitimate reply for a
  case with no security content. **What fails loud is no longer only the recipient
  rules** — since the owner's ruling, an emitted line that would exceed 998 octets
  also refuses (step 7). The distinction that survives is between *absent* data,
  which is tolerated by omitting a header, and data that *cannot be emitted
  conformingly*, which refuses.
- **The E2E harness needs no change, measured.** `allowedMethodsFor`
  (`tests/scenarios/broker-e2e/run-broker-e2e.js:63-79`) derives permitted methods
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
       absent; **every table key equals its own record's `name`**; and **all nine**
       records match Table A completely — `service`, capability class,
       `extraClasses`, the whole `limits` object, the input schema's complete
       top-level key set, `type`, `required`, `additionalProperties: false`, and
       every property's full schema including its `pattern`. An enumerated record
       over the whole table, not a list of forbidden names, not a list of key
       names, and not a gmail-only subset — so a new address-bearing key of any
       spelling, a **weakened** value schema, a **swapped** pair of names, and a
       renamed-and-reclassified non-gmail verb all fail. (V1, V4, V5)
2. [ ] `create_draft_to_self` addresses the draft to the `getProfile`-resolved
       account address and to nothing else; an argument object carrying any
       address key is schema-rejected with zero Google calls; a `getProfile`
       result with no usable address creates no draft and raises the fixed message
       from Exact contracts. (V1 — identity `[AUD-D1]`)
3. [ ] `create_reply_draft` addresses the draft to the one recipient Table B's
       order produces, over **every** row of Table B's ACCEPTED case table —
       including the two round-2 false refusals, `"Alice"<…>` with no whitespace
       before the `<` and `Alice "Team <east>" <…>`; the MIME carries exactly one
       `To` and no `Cc`/`Bcc`; an address written into `body` reaches no header.
       (V1 — `[AUD-D2]`)
4. [ ] Zero `drafts.create` calls and the fixed refusal message when
       `messages.get` fails, and for **every** row of Table B's REFUSED case
       table — every row refused at steps 0, 1, 2, 3 and 4. The criterion
       quantifies over that table and does not carry its own list. **Step 7's
       refusals are criterion 5's**, because they are about what the verb builds
       rather than what it accepts. (V1 — `[AUD-D3]`)
5. [ ] The reply draft's `drafts.create` request carries the source `threadId`;
       its MIME carries `In-Reply-To` and `References` per Table B when the source
       has a `Message-ID`, and with no `Message-ID` is byte-identical to a
       non-reply draft's; and its `Subject` is **`Re:` plus a space plus the source
       subject, unmodified and never truncated** — asserted over Table B's subject
       rows, including a 900-character subject and one whose astral character
       straddles position 512, which must round-trip with no `U+FFFD`; **an empty,
       spaces-only or tabs-only source subject derives the empty string, and the
       derivation is a fixed point under a second application**. These are Gmail's
       documented threading conditions (Table B's Gmail bullet); the assertion is
       on the request, not on a live round-trip. **And every header line the draft
       would emit is ≤998 UTF-8 octets: at each of Table B's step-7 boundary rows
       for `Subject`, `In-Reply-To` and `References`, the accepted side produces a
       line of exactly 998 and the refused side produces zero `drafts.create` calls
       with step 7's own fixed message.**
       **The `To` rows are CONDITIONAL on how the implementation reads step 4's
       "320 characters", which this package deliberately does not pin (Table B):**
       - under **code points**, the 998-accepted and 999-refused `To` rows are
         reachable and must be asserted as written;
       - under **UTF-16 `.length`**, both astral witnesses refuse at **step 4** and
         the assertion is instead *"step 4 refuses, and no `To` line over 998
         octets is reachable at all"* — measured: the largest `To` line the grammar
         and a code-unit step 4 jointly admit is **950 octets**.
       Either way step 7 covers `To`; only which row is reachable changes.
       (V1 — `[AUD-D4]`)
6. [ ] A CR or LF **anywhere** in **any** of the five raw header values Table B
       step 1 reads — `Reply-To`, `From`, `Subject`, `Message-ID`, `References`,
       injected **one field at a time**, including at the leading and trailing
       boundary and beyond the Subject's 512-character truncation point, and
       including a header step 2 will not select — produces zero `drafts.create`
       calls, **and the refusal is step 1's** — identified by its fixed message,
       which differs from `assertHeaderSafe`'s. **Step 8's** `assertHeaderSafe` is
       defence in depth; through this verb it is unreachable, so it is measured
       separately by calling `buildMime` directly.
       (V1 — `[AUD-D5]` through the verb, `[AUD-D7]` on `buildMime`)
7. [ ] Both new verbs are `CAPABILITY_CLASS.DRAFT` and are never grant-gated:
       `registry.js:71`'s gate still fires only for SEND, and a `grantCheck` that
       always returns `false` does not change either verb's outcome. (V1)
8. [ ] Driven through the REAL `assembleRegistry`, for **each** of
       `create_draft_to_self` and `create_reply_draft`, on a **SINGLETON profile**
       whose `brokerVerbs` is exactly `[verb]` — a READ sibling such as
       `gmail_read` on the same profile makes the old single-class derivation load
       READ anyway, and every state then passes while the defect is still there.
       In three credential states: READ unavailable → the exact fixed
       `the READ credential is not available in this run` and **zero** Google
       calls; DRAFT unavailable → the same sentence naming `DRAFT`, zero Google
       calls; both loaded → the call reaches the verb's handler. The injected
       loader is **instrumented**: the criterion asserts the **set of classes
       actually REQUESTED** is `{DRAFT, READ}`, not only the dispatch outcome — an
       outcome-only assertion is what the sibling masked.
       **The requested-class and missing-class assertions must hold on the NO-`deps`
       path too**, not only the injected one: an implementation that consults
       `requiredClassesFor` only when `deps.loadServices` was supplied, and keeps
       the old single-class derivation otherwise, passes every injected case while
       production — which calls `assembleRegistry` with no `deps` — stays broken.
       The seam that makes this checkable is stated in Exact contracts: the default
       is resolved **once at entry**, so both paths execute the same body.
       An unknown verb name makes `requiredClassesFor` throw. (V1 — `[AUD-D6]`)
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

# V5 — criterion 1's universal. Compares the COMPLETE canonical record of ALL NINE
# verbs against a literal derived from Table A, and pins that each table KEY equals
# its record's `name`. Both are load-bearing, measured: a name-only check passes a
# weakened schema; a gmail-only check passes `calendar_list` renamed and reclassed
# to DRAFT; and comparing records without the key/name tie passes the two new verbs
# with their names SWAPPED, which silently advertises each one's schema under the
# other's name. MUST exit 0.
node -e 'const { VERBS } = require("./src/gws/broker/verbs.js");
const KB = 1024, NO_CRLF = "^[^\\r\\n]*$";
const ISO_TS = "^\\d{4}-\\d{2}-\\d{2}([T ]\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:?\\d{2})?)?$";
const TABLE_A = {
  gmail_search: { service:"gmail", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50}, required:[ "query" ],
    properties:{ query:{type:"string",maxLength:512}, max:{type:"integer",min:1,max:20} } },
  gmail_read: { service:"gmail", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50,maxResultBytes:64*KB}, required:["id"],
    properties:{ id:{type:"string",maxLength:128,pattern:"^[A-Za-z0-9_-]+$"} } },
  calendar_list: { service:"calendar", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50}, required:[],
    properties:{ from:{type:"string",maxLength:40,pattern:ISO_TS}, to:{type:"string",maxLength:40,pattern:ISO_TS}, max:{type:"integer",min:1,max:20} } },
  calendar_show: { service:"calendar", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50}, required:["id"],
    properties:{ id:{type:"string",maxLength:1024} } },
  drive_search: { service:"drive", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50}, required:["term"],
    properties:{ term:{type:"string",maxLength:512}, raw:{type:"boolean"}, max:{type:"integer",min:1,max:20} } },
  drive_read: { service:"drive", capabilityClass:"READ", extraClasses:[], limits:{maxCallsPerRun:50,maxResultBytes:256*KB}, required:["id"],
    properties:{ id:{type:"string",maxLength:128} } },
  create_draft_to_self: { service:"gmail", capabilityClass:"DRAFT", extraClasses:["READ"], limits:{maxCallsPerRun:3}, required:["subject","body"],
    properties:{ subject:{type:"string",maxLength:512,pattern:NO_CRLF}, body:{type:"string",maxLength:64*KB} } },
  create_reply_draft: { service:"gmail", capabilityClass:"DRAFT", extraClasses:["READ"], limits:{maxCallsPerRun:10}, required:["id","body"],
    properties:{ id:{type:"string",maxLength:128,pattern:"^[A-Za-z0-9_-]+$"}, body:{type:"string",maxLength:64*KB} } },
  send_digest_to_self: { service:"gmail", capabilityClass:"SEND", extraClasses:[], limits:{maxCallsPerRun:2}, required:["subject","body"],
    properties:{ subject:{type:"string",maxLength:512,pattern:NO_CRLF}, body:{type:"string",maxLength:64*KB} } },
};
const key = (o) => JSON.stringify(o, (k,v) => (v && typeof v === "object" && !Array.isArray(v))
  ? Object.keys(v).sort().reduce((a,n)=>(a[n]=v[n],a),{}) : v);
const fail = [];
const names = Object.keys(VERBS).sort(), want = Object.keys(TABLE_A).sort();
if (key(names) !== key(want)) fail.push("verb table is " + JSON.stringify(names) + ", Table A is " + JSON.stringify(want));
for (const [k, w] of Object.entries(TABLE_A)) {
  const v = VERBS[k];
  if (!v) { fail.push(k + " is absent from the verb table"); continue; }
  if (v.name !== k) fail.push("VERBS[" + JSON.stringify(k) + "].name is " + JSON.stringify(v.name) + " — the table KEY and the record name must be the same string");
  const s = v.inputSchema || {};
  const got = { service:v.service, capabilityClass:v.capabilityClass, extraClasses:[...(v.extraClasses||[])].sort(),
    limits: v.limits, schemaKeys: Object.keys(s).sort(), type: s.type,
    required: [...(s.required||[])].sort(), additionalProperties: s.additionalProperties, properties: s.properties || {} };
  const exp = { service:w.service, capabilityClass:w.capabilityClass, extraClasses:[...w.extraClasses].sort(),
    limits: w.limits, schemaKeys: ["additionalProperties","properties","required","type"], type: "object",
    required: [...w.required].sort(), additionalProperties: false, properties: w.properties };
  if (key(got) !== key(exp)) fail.push(k + " record differs from Table A:\n      got  " + key(got) + "\n      want " + key(exp));
}
if (fail.length) { console.error("V5 FAIL:\n  - " + fail.join("\n  - ")); process.exit(1); }
console.log("V5 OK: the verb table is exactly Table A\u0027s " + names.length + " names, each table key equals its record name, and every record matches Table A on service, capabilityClass, extraClasses, limits, the inputSchema\u0027s complete top-level key set, type, required, additionalProperties and every property schema. It verifies NOTHING about handlers, descriptions or apiMethod strings.");'
rc=$?; echo "V5 exit: $rc"                  # 0 required
```

V4 and V5 were each observed in every state at design time; the outputs are in
`docs/specs/logbook/2026-09-05-audit-d-design-gate-rounds.md`, where V5's current
form is proved green on the compliant tree and red on **six** distinct weakenings
plus the pinned base and the deliverable-absent tree. V5 has now been wrong three
times, and every time a both-directions run is what caught it: round zero's draft
was over-strict (it red-flagged `calendar_list`'s ISO-timestamp `from`/`to`);
round 1's was a **denylist**, which a schema declaring `destination` walked past;
round 2's pinned only names, which a **weakened** schema walked past. The lesson
is one the repo already owns — enumerating your OWN GOOD is closable, enumerating
the BAD is not — and the form above extends it from names to whole records.

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

## Dispatch precondition — owner items (ten: nine recommendations, one direct ruling)

Items 1–9 carry a recommendation and were dispatched under the owner's **standing
instruction**; all ten are filed, per item, in
`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-queue.md`.
**Item 10 is different: it is a DIRECT ruling**, given in session on 2026-09-05
after the owner read this package's ruling brief, and it is already applied to
Table B. The owner may reverse any of the ten by dated amendment.

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
   **Named residual (routed by round 5, accepted).** Step 2's ruled predicate
   `/[^ \t]/` treats only ASCII space and tab as blank, so a `Reply-To` consisting
   solely of `U+00A0` — Unicode horizontal whitespace — counts as *content*, is
   selected, and is then refused by the grammar instead of falling through to
   `From`. **The outcome is a refusal and never a wrong recipient**, so it costs a
   draft, not safety; widening the predicate to Unicode whitespace would reopen
   R4-B's cost question on the one test the owner just ruled must stay linear.
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
7. **Table B's grammar is narrower than RFC 5322** (it refuses quoted local parts,
   address literals, dotless domains, comments, groups and obsolete forms, with no
   draft).
   *Recommendation: accept the narrowing.* This is the one field an attacker fully
   controls; fail closed.
   *Cost of overruling:* a looser grammar admits addresses the broker cannot reason
   about, on the exact field this package exists to constrain.
8. **Table B step 0's 998-character bound, on EVERY raw header value the verb
   reads, is a NEW refusal of long-but-legal headers** — a single unfolded header value longer than
   RFC 5322 §2.1.1's line limit is refused with no draft, before the grammar sees
   it. *Recommendation: take the bound.* It is what makes the grammar's cost a
   non-question on any engine and any input, rather than a property that has to be
   re-argued each time the pattern changes — which is what round 1 and round 2 both
   spent a finding on. **Measured**: at the bound a hostile header costs ≤ 3.24 ms
   even against the backtracking forms the bound was introduced to cap, versus
   3 393 ms for the same shape unbounded at 32 000 characters; and a 4 MB value is
   now refused by a length comparison at 0.012 ms instead of being scanned or
   trimmed first.
   **The bound CAN refuse conforming mail, and that is its real cost.** An earlier
   draft of this item claimed it was "unreachable by conforming mail because such a
   value would have arrived folded, and folding means CRLF". **That was wrong** —
   Gmail's API returns header values **unfolded**, RFC 5322 §2.2.3 permits an
   unfolded field of any length, and a conforming display-name phrase folded at
   ≤81 characters per line unfolds to 1 239 characters carrying no CR/LF at all
   (executed in round 3). So a legitimate message with a very long `Subject`,
   `References` chain or display name is refused, and its reply is not drafted.
   *Cost of overruling:* without a pre-parse bound the worst case reverts to an
   input-dependent claim needing re-measurement on every engine after every change
   — which is what the two Table B cost findings were — and every operation before
   the bound becomes attacker-scaled again.
   *Cost of overruling:* without a pre-parse bound the grammar's worst case becomes
   an input-dependent claim that must be re-measured on every engine after every
   change to the pattern, and the two Table B findings that fired the
   ADR-0031 breaker were both of exactly that kind.

### Item 10 — RULED (a) by the owner, 2026-09-05 — the FIRST direct ruling

Items 1–9's recommendations were dispatched under the owner's **standing
instruction**. This is the **tenth** decision and the **first DIRECT one**: the
owner read `docs/specs/logbook/2026-09-05-audit-d-owner-brief-derived-headers.md`
at `197cd797` and ruled in session.

Question: a derived `Subject`, `References` or `In-Reply-To` line can exceed RFC
5322's 998-octet limit even though every input was bounded — refuse at the output,
fold and encode in `buildMime`, or trim `References` from the middle?

**RULED: (a) refuse at the output**, plus the two small fixes (R4-B's prescribed
linear blank-check, R4-C's empty-subject fixed point). Applied as Table B step 7,
step 2's derived form, and step 5's empty case. **(c)** — trim `References` from
the middle — is named as the **successor candidate** and is deliberately **not
filed** as a work package; the owner may file it by a later ruling if dogfooding
shows deep threads matter. **(b)** — folding and RFC 2047 in `buildMime` — is
**rejected for this package**: MIME-construction machinery and its tests inside a
package about recipients, plus another full design round.

*Cost of the ruling, accepted:* a subject over ~985 octets, or a thread whose
`References` plus parent id exceed the budget, cannot be reply-drafted — the user
replies by hand. Full provenance:
`docs/specs/logbook/2026-09-05-owner-rulings-audit-d-derived-headers.md`.

### Item 9 — the escalation's disposition (recorded verbatim)

The pinned stop criterion fired in round 3: two Table B rows admitted cases the
executed table did not refuse. The criterion said the next step was an owner ruling
on the recipient design. **The orchestrator's judgment under the owner's standing
instruction, recorded verbatim as that disposition and as owner item 9:**

> These two are the ORDER contract not yet applied to two of its own rows — the
> same "parsing before bounding" defect the pass named, surviving in step 1 and
> step 5 — not evidence against deriving the recipient from the message.
> Item 9: *keep `create_reply_draft` as a code-derived-recipient verb;
> recommendation: keep; cost of overruling: inbox-triage loses its only outward
> action (drafts nothing), and the audit's group D ruling is reopened.*

The owner may reverse this by dated amendment.

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
