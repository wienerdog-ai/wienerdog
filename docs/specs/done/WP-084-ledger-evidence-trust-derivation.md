---
id: WP-084
title: Bind ledger learnings to skill invocations — window-based mechanical trust
status: Done
model: opus
size: M
depends_on: [WP-080, WP-081, WP-083]
adrs: [ADR-0020, ADR-0012]
branch: wp/084-ledger-evidence-trust-derivation
---

# WP-084: Bind ledger learnings to skill invocations — window-based mechanical trust

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent sessions into the user's markdown
**vault**. A sandboxed brain writes; the **orchestrator** (`src/core/dream/validate.js`,
`validateAndCommit`) re-checks every write and makes one commit (ADR-0012). After
WP-081 the dream accumulates per-skill learnings into a validated ledger
`<skills_dir>/<name>/LEARNINGS.md`; each `##` entry records `Session-IDs` (distinct
`<harness>:<session_id>`), a `Recurrence` count, a `derived_from_untrusted` flag,
and an `Observation`. WP-082 later revises a skill's BODY only when a learning has
≥ 3 distinct sessions **and is not untrusted-derived** — the injection defense.

**The gap this WP closes (ADR-0020 round-5 review).** WP-081 verifies a learning's
counters structurally but not their **relevance**: a poisoned brain can list three
real, same-run sessions that have nothing to do with the skill, assert
`derived_from_untrusted: false`, write an attacker-chosen `Observation`, and — since
the sessions are real and the flag is asserted — WP-082 authorizes an
attacker-chosen **persistent** body edit next run. This is not "quality drift"; it
is persistent instruction injection.

**This WP binds counted sessions to real invocations and derives trust from the
invocation window.** WP-080 already emits, per Claude extract, a structured
`skill_invocations` signal `[{skill, index, errored}]` (each `Skill` tool_use's
name, its 0-based position in the extract's `messages` timeline, and whether its
result errored). Using it, the orchestrator enforces at commit time:

1. **Invocation binding.** A Claude session may be newly counted toward a skill's
   learning ONLY if that session's extract `skill_invocations` actually invoked
   **this** skill (name equality with the ledger's parent skill). An unrelated
   session is reverted — killing the "any three real sessions" attack.
2. **Window-based trust.** Trust is derived from the invocation **window**, not from
   the brain's chosen sentence: window = from the skill's invocation `index` to the
   **next** invocation's `index` (any skill) or end-of-extract. If any message in
   the window has role `tool_result` **other than the message at the invocation's
   `resultIndex`** (WP-080's id-paired own result — the registered skill's own
   Tier-3-gated body output, not external data), that session contributes UNTRUSTED
   (an omitted external `tool_result` taints regardless). The own result is
   identified by WP-080's `tool_use_id` pairing, **not by position**, so a batched
   external tool (e.g. `Read`) whose result lands first cannot be mistaken for it.
   The derivation **fails closed** (contributes UNTRUSTED) when `resultIndex` is
   `null`, non-integer, or outside the window, or when `index` is out of range. The
   entry is untrusted if any newly-counted session's window is tainted; the brain's
   asserted flag may only RAISE, never lower, the derived value.

**Evidence-line message references are dropped.** An earlier draft had the brain
cite supporting messages (`Evidence:` refs) and derived trust from the cited roles —
but that verified existence and role, not relevance, and the brain chose which
messages to cite. Invocation-binding + window-derivation makes citations
unnecessary: the orchestrator derives everything from the structured signal
(invocation presence + window roles), so the ledger format keeps its WP-081 shape
(no `Evidence` line). Simpler, and the guarantees are strictly stronger.

Two invariants bound this WP. **Wienerdog is just files (ADR-0004):** pure
validation in the already-scheduled dream, no new process. **The extracts are in
scope at validate time:** `validateAndCommit` receives `expectedScratch` (the exact
extract files WP-008 wrote) and Step-1's scratch-integrity check (WP-017) guarantees
they are byte-unmodified — so their `skill_invocations` and message roles are
authoritative. Hard-depends on WP-080 (the `index`-bearing signal), WP-081 (the
ledger validator it extends), and WP-083 (the registry, via WP-081).

## Current state

**`skills/wienerdog-dream/SKILL.md`** — after WP-081, the `## Skill learnings`
section defines the ledger format (Pattern-Key, Status, Recurrence, Session-IDs,
First-/Last-Seen, `derived_from_untrusted`, Observation) and tells the brain a
Claude session "used" a skill when the extract's `skill_invocations` names it, a
Codex session when the text shows it.

**`src/core/dream/validate.js`** — after WP-081/083, module scope has
`parseLedgerEntries`, `ledgerEntrySchemaViolation`, and
`ledgerViolation(vaultDir, rel, change, layout, registry)`. `ledgerViolation`'s
append-only block does `const head = parseLedgerEntries(headRes.stdout)` inside
`if (!change.untracked)`. `validateAndCommit(o)` receives `o.expectedScratch` (array
of scratch extract file paths; already read by Step-1's scratch-integrity scan). The
Step-2 ledger branch calls `ledgerViolation(vaultDir, rel, change, layout, registry)`
and reverts (removal-safe) on a reason.

**WP-080 signal + extract shape** — each `expectedScratch` file is a JSON object
`{ harness, session_id, messages:[{role, text, ts}], skill_invocations:[{skill, index, resultIndex, errored}], … }`.
`skill_invocations` is present on Claude extracts (`[]` if none) and **absent on
Codex extracts** (Codex `$skill` mentions survive only as spoofable text). `index`
and `resultIndex` are 0-based positions into `messages`, **already rebased by
WP-080 under the message cap** so they index the exact `messages` array here;
`resultIndex` is the id-paired own result (or `null` if uncaptured).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | skills/wienerdog-dream/SKILL.md | add a "Which sessions count, and trust" subsection (invocation binding + window trust + Codex v1 limit) |
| modify | src/core/dream/validate.js | build `extractsBySession`; extend `ledgerViolation` with invocation-binding + window-based trust derivation for new Claude sessions |
| modify | tests/unit/dream-validate.test.js | `seedExtracts` helper (messages + skill_invocations); patch the WP-081 "valid ledger kept" test; add binding/window/Codex tests |
| modify | tests/unit/dream-skill-structure.test.js | assert the binding/window/Codex prose is present |

### Exact contracts

#### 1. `skills/wienerdog-dream/SKILL.md` — session-counting + trust prose

Add this subsection at the end of `## Skill learnings` (before `## Dream report`),
ordinary three-backtick fences (shown in a four-backtick fence so any inner fence
survives):

````
### Which sessions count, and trust

Only count a session in an entry's `Session-IDs` if that session genuinely used
this skill. For a **Claude** session that means its extract `skill_invocations`
names this skill; the orchestrator re-checks this and reverts an entry that counts
a Claude session which did not invoke the skill.

You still write `derived_from_untrusted`, but the orchestrator DERIVES it from each
counted session's invocation **window** — the messages from where this skill was
invoked up to the next skill invocation (or the end of the session). If any tool
result OTHER than this skill's own result appears in that window (external tool
output — a shell command, a fetched page, a file read), the session is
untrusted-derived, and the orchestrator RAISES your flag to `true` (it never accepts
a value LOWER than the derived one). So mislabeling can only make an entry more
untrusted, never less.

**Codex sessions do not authorize revisions (v1).** Codex has no structured
invocation signal, so a Codex session may be recorded as a quarantined learning but
never counts toward the ≥ 3 sessions that let a later dream revise a skill body. A
Codex-only install still gets skill creation and learnings; autonomous body revision
needs Claude invocation evidence.
````

#### 2. `src/core/dream/validate.js` — binding + window derivation

**(a) Build `extractsBySession`** before the Step-2 loop, indexed by
`<harness>:<session_id>`; pass it to the ledger branch:

```js
// WP-084: index this run's processed extracts so the ledger validator can bind
// counted sessions to real invocations and derive trust from the invocation
// window. expectedScratch are collectExtracts' outputs (WP-008); Step-1's
// scratch-integrity check guarantees they are byte-unmodified.
const extractsBySession = new Map();
for (const p of (expectedScratch || [])) {
  try {
    const ex = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (ex && ex.harness && ex.session_id) extractsBySession.set(`${ex.harness}:${ex.session_id}`, ex);
  } catch { /* unreadable extract → its sessions won't verify → fail closed in (c) */ }
}
```

```js
if (isLearningsLedger(rel)) {
  const reason = ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession);
  // …existing removal-safe revert + reverted.push…
  continue;
}
```

**(b) Window helper** (module scope):

```js
/**
 * Is any of `parentSkill`'s invocation windows in this extract tainted by an
 * EXTERNAL tool_result? Window = [inv.index, next-invocation-index or
 * messages.length). The invocation's OWN paired result is the message at
 * `inv.resultIndex` (WP-080's id-pairing, NOT positional) and is EXCLUDED — it is
 * the registered skill's own Tier-3-gated body output. Every OTHER tool_result in
 * the window (Bash output, web content, file reads) taints. FAILS CLOSED (returns
 * true = tainted) on any malformed geometry: index out of range, or resultIndex
 * null / non-integer / outside the window.
 * @param {{messages?:Array, skill_invocations?:Array}} extract
 * @param {string} parentSkill
 * @returns {boolean}
 */
function invocationWindowTainted(extract, parentSkill) {
  const msgs = Array.isArray(extract.messages) ? extract.messages : [];
  const invs = Array.isArray(extract.skill_invocations) ? extract.skill_invocations : [];
  const starts = invs.map((si) => si.index).filter((n) => Number.isInteger(n)).sort((a, b) => a - b);
  for (const inv of invs) {
    if (inv.skill !== parentSkill) continue;
    if (!Number.isInteger(inv.index) || inv.index < 0 || inv.index >= msgs.length) return true; // fail closed
    const next = starts.find((n) => n > inv.index);
    const end = next === undefined ? msgs.length : next;
    const ri = inv.resultIndex;
    if (!Number.isInteger(ri) || ri < inv.index || ri >= end) return true; // null/out-of-window own result → fail closed
    for (let i = inv.index; i < end; i++) {
      if (i === ri) continue;                                    // the invocation's own paired result — excluded
      if (msgs[i] && msgs[i].role === 'tool_result') return true; // any OTHER tool_result → taint
    }
  }
  return false;
}
```

**Own-result identification is exact, not positional.** The excluded message is
precisely `messages[inv.resultIndex]`, which WP-080 set from the `tool_use_id`
pairing when it pushed that result. A batched external tool call (e.g. a `Read`
whose result lands *before* the skill's result) therefore taints — its result is
NOT the excluded one. The `next` invocation's index closes the window, so
back-to-back invocations never absorb each other's results. WP-080 guarantees (its
capping invariant) that `index`/`resultIndex` index the exact `messages` array in
scope here; this helper additionally fails closed on any residual out-of-range or
null value, so a padded/truncated session can never derive clean by accident.
```

**(c) `ledgerViolation`** — add the `extractsBySession` parameter and **hoist** the
HEAD parse out of the append-only block so the new binding loop can tell which
sessions are new (rename the local `head` to a function-scope `headEntries`):

```js
function ledgerViolation(vaultDir, rel, change, layout, registry, extractsBySession) {
  // …(a) sibling checks and (b) schema, unchanged…

  let headEntries = {};
  if (!change.untracked) {
    const headRes = git(vaultDir, ['show', `HEAD:${rel}`], { allowFail: true });
    if (headRes.status !== 0) {
      return 'learnings ledger is tracked but its committed version is unreadable (cannot verify append-only)';
    }
    headEntries = parseLedgerEntries(headRes.stdout);
    for (const [key, he] of Object.entries(headEntries)) {
      // …existing append-only + monotonic checks, unchanged (they iterate headEntries)…
    }
  }

  // (h) Bind newly-counted Claude sessions to real invocations of THIS skill, and
  //     derive trust from the invocation window (WP-084). Codex sessions are not
  //     verified here and never authorize (WP-082 counts Claude sessions only).
  const parentSkill = path.basename(path.dirname(rel)); // dream-created folder == skill name
  for (const [key, ce] of Object.entries(cur)) {
    const he = headEntries[key];
    const headSessions = new Set(he ? he.sessionIds : []);
    let derivedUntrusted = false;
    for (const sid of ce.sessionIds) {
      if (headSessions.has(sid)) continue;      // preserved — verified when it was added
      if (!sid.startsWith('claude:')) continue; // Codex: loose accumulation, never authorizes (v1)
      const extract = extractsBySession.get(sid);
      if (!extract) return `learnings ledger entry ${key}: new session ${sid} is not among this run's processed extracts`;
      const invs = Array.isArray(extract.skill_invocations) ? extract.skill_invocations : [];
      if (!invs.some((si) => si.skill === parentSkill)) {
        return `learnings ledger entry ${key}: session ${sid} did not invoke skill ${parentSkill}`;
      }
      if (invocationWindowTainted(extract, parentSkill)) derivedUntrusted = true;
    }
    if (derivedUntrusted && ce.untrusted !== true) {
      return `learnings ledger entry ${key}: derived_from_untrusted asserted lower than derived (an invocation window contains a tool_result)`;
    }
  }
  return null;
}
```

No other change to `validate.js`. Preserved (in-HEAD) Claude sessions were bound
when they were added; only NEW Claude sessions are re-checked. An untracked
(brand-new) ledger has `headEntries = {}`, so all its Claude sessions are checked.

#### 3. `tests/unit/dream-validate.test.js` — helper + binding/window tests

Add a helper that writes scratch extracts with messages AND `skill_invocations`,
and thread `expectedScratch` through `run`:

```js
// specs: [{ session, messages:[role,…], invocations:[{skill,index,resultIndex,errored}] }]
function seedExtracts(root, specs) {
  const dir = path.join(root, 'extracts');
  fs.mkdirSync(dir, { recursive: true });
  return specs.map(({ session, messages = [], invocations = [] }) => {
    const [harness, session_id] = session.split(':');
    const p = path.join(dir, `${harness}-${session_id}.json`);
    fs.writeFileSync(p, JSON.stringify({ harness, session_id, messages: messages.map((role, i) => ({ role, text: `m${i}`, ts: null })), skill_invocations: invocations }));
    return p;
  });
}
const run = (vault, scratch, stateDir, expectedScratch = []) =>
  validateAndCommit({ vaultDir: vault, scratchDir: scratch, date: '2026-07-11', expectedScratch, stateDir });
// A clean bound session: its ONLY window message is the skill's own paired result.
const clean = (session) => ({ session, messages: ['tool_result'], invocations: [{ skill: 'foo', index: 0, resultIndex: 0 }] });
```

Patch the WP-081 **"valid ledger beside a REGISTERED skill is kept"** test (its
ledger is an untracked add, so both sessions are new and must bind): seed extracts
where each session invoked `foo` with a clean window (own result only), and pass
them:

```js
const es = seedExtracts(root, [clean('claude:sess-a'), clean('claude:sess-b')]);
const res = run(vault, scratch, stateDir, es);
```

Add these tests (all use the `SKILL`/`LEDGER`/`seedReg` fixtures; parent skill is
`foo`). Every bound Claude invocation carries a `resultIndex` — the own paired
result — so a missing/`null` `resultIndex` is itself a fail-closed case (tested):

```js
test('dream-validate: a ledger counting a session that did NOT invoke the skill is reverted (relevance)', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER); // counts sess-a, sess-b
  const es = seedExtracts(root, [
    clean('claude:sess-a'),
    { session: 'claude:sess-b', messages: ['tool_result'], invocations: [{ skill: 'bar', index: 0, resultIndex: 0 }] }, // invoked a DIFFERENT skill
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md' && /did not invoke skill foo/.test(r.reason)));
});

test('dream-validate: a counted session absent from this runs extracts is reverted (fail closed)', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER);
  const es = seedExtracts(root, [clean('claude:sess-a')]); // sess-b missing
  const res = run(vault, scratch, stateDir, es);
  assert.ok(res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md' && /not among this run/.test(r.reason)));
});

test('dream-validate: a batched EXTERNAL tool result before the skill result taints (own matched by id, not position)', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER); // asserts derived_from_untrusted: false
  const es = seedExtracts(root, [
    // A Read batched BEFORE Skill: messages[0] = the (attacker-influenceable) Read result,
    // messages[1] = the skill's OWN result. resultIndex=1 excludes only messages[1], so the
    // Read result (messages[0]) taints — a positional "first tool_result" rule would miss it.
    { session: 'claude:sess-a', messages: ['tool_result', 'tool_result'], invocations: [{ skill: 'foo', index: 0, resultIndex: 1 }] },
    clean('claude:sess-b'),
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md' && /asserted lower than derived/.test(r.reason)));
});

test('dream-validate: an invocation with a null resultIndex fails closed (untrusted)', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER); // asserts derived_from_untrusted: false
  const es = seedExtracts(root, [
    { session: 'claude:sess-a', messages: ['assistant'], invocations: [{ skill: 'foo', index: 0, resultIndex: null }] }, // no captured result
    clean('claude:sess-b'),
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md' && /asserted lower than derived/.test(r.reason)));
});

test('dream-validate: a window with ONLY the own paired result is clean (trusted) and kept', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER); // asserts derived_from_untrusted: false
  const es = seedExtracts(root, [clean('claude:sess-a'), clean('claude:sess-b')]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(!res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md'), 'own-result-only window is trusted');
});

test('dream-validate: back-to-back invocations — the next skill\'s result is not attributed to the first', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER); // asserts derived_from_untrusted: false
  const es = seedExtracts(root, [
    // foo@0 (own result messages[0]) then bar@1 (result messages[1]). foo's window is [0,1),
    // so bar's result must NOT be in it → foo stays clean/trusted.
    { session: 'claude:sess-a', messages: ['tool_result', 'tool_result'], invocations: [{ skill: 'foo', index: 0, resultIndex: 0 }, { skill: 'bar', index: 1, resultIndex: 1 }] },
    clean('claude:sess-b'),
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(!res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md'), 'foo window bounded by bar invocation');
});

test('dream-validate: a tainted window honestly asserted untrusted:true is kept', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER.replace('- derived_from_untrusted: false', '- derived_from_untrusted: true'));
  const es = seedExtracts(root, [ // Read-before-Skill taint (messages[0]), asserted true → honest
    { session: 'claude:sess-a', messages: ['tool_result', 'tool_result'], invocations: [{ skill: 'foo', index: 0, resultIndex: 1 }] },
    clean('claude:sess-b'),
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(!res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md'), 'honest untrusted:true kept');
});

test('dream-validate: a fully-bound entry with only clean windows is kept', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', LEDGER);
  const es = seedExtracts(root, [
    { session: 'claude:sess-a', messages: ['tool_result', 'user'], invocations: [{ skill: 'foo', index: 0, resultIndex: 0 }] }, // own result + a user turn
    clean('claude:sess-b'),
  ]);
  const res = run(vault, scratch, stateDir, es);
  assert.ok(!res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md'), 'verified trusted ledger kept');
});

test('dream-validate: a Codex session in Session-IDs is not invocation-checked (loose accumulation)', () => {
  const { root, vault, scratch } = tempVault({ '05-Skills/foo/SKILL.md': SKILL });
  const stateDir = seedReg(root);
  const codexLedger = LEDGER
    .replace('- Recurrence: 2', '- Recurrence: 3')
    .replace('- Session-IDs: claude:sess-a, claude:sess-b', '- Session-IDs: claude:sess-a, claude:sess-b, codex:sess-c');
  writeVault(vault, '05-Skills/foo/LEARNINGS.md', codexLedger);
  const es = seedExtracts(root, [clean('claude:sess-a'), clean('claude:sess-b')]); // NO extract for codex:sess-c
  const res = run(vault, scratch, stateDir, es);
  assert.ok(!res.reverted.some((r) => r.path === '05-Skills/foo/LEARNINGS.md'), 'codex session accumulates without invocation check');
});
```

The other WP-081 ledger tests revert at the registry/schema/append-only steps
before the binding loop (or count only preserved sessions), so they need no extract
seeding beyond the fixtures.

#### 4. `tests/unit/dream-skill-structure.test.js` — one assertion set

```js
test('dream-skill: skill-learnings binds counted sessions to invocations with window trust', () => {
  assert.ok(/skill_invocations/.test(text), 'invocation-binding prose present');
  assert.ok(/window/i.test(text), 'invocation-window trust prose present');
  assert.ok(/tool result/i.test(text), 'tool-result taint rule present');
  assert.ok(/Codex sessions do not authorize/i.test(text), 'Codex v1 scope limit present');
});
```

## Implementation notes & constraints

- **Zero new dependencies**; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- **Parent skill name = the ledger's folder name** (`basename(dirname(rel))`). The
  dream creates a skill's folder as its kebab invocation name, so the folder equals
  the name that appears in `skill_invocations`. (If a future change lets them
  diverge, read the sibling `SKILL.md`'s name instead — out of scope now.)
- **Only NEW Claude sessions are verified.** A session already in the HEAD entry was
  bound the run it was added; its window trust is baked into the committed
  `derived_from_untrusted` (raise-only, WP-081). Codex sessions are skipped (no
  signal) and never authorize (WP-082 counts Claude sessions only).
- **The window EXCLUDES exactly `messages[inv.resultIndex]`** (WP-080's id-paired
  own result) — it is the registered skill's own Tier-3-gated body output, not
  external data. Every OTHER `tool_result` (Bash output, web content, file reads)
  still taints, INCLUDING a batched tool whose result precedes the skill's. So
  autonomous revision requires ≥ 3 Claude sessions in which the skill ran WITHOUT
  other captured tool output — tool-free procedural skills are genuinely revisable;
  tool-using skills rarely are (the conservative posture stands). A rule that
  tainted on the own result too would make trusted authorization literally
  unreachable (vacuous), which is why exactly that one message is excluded.
- **Trust fails closed on malformed geometry.** A bound session whose invocation
  has an out-of-range `index`, or a `null`/non-integer/out-of-window `resultIndex`,
  contributes UNTRUSTED (never clean). WP-080 rebases indexes under the cap so this
  is defensive, but it must be present — a padded session must not derive clean.
- **The own result must be inside the window** to be excluded; a `resultIndex` at
  or after the next invocation's index is treated as absent (fail closed), so a
  second invocation's result is never wrongly excluded from the first's window.
- Index base is 0 and refers to the extract's `messages` array exactly as the brain
  read it (Step-1 integrity guarantees no drift).
- **No migration:** no dream-created skill has a ledger in any field vault yet, so
  there are no pre-binding ledgers to reconcile.
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] A newly-counted Claude session must (i) be present in this run's processed
      extracts and (ii) actually invoke THIS skill (`skill_invocations` name
      equality) — so a brain cannot count unrelated real sessions to mint
      recurrence for an attacker-chosen skill (the round-5 attack).
- [ ] `derived_from_untrusted` is DERIVED from the invocation window — any
      `tool_result` OTHER than the id-paired own result `messages[resultIndex]`
      (external tool output) → untrusted — not from the brain's chosen sentence; an
      omitted external tainting message taints anyway. The own result is matched by
      WP-080's `tool_use_id` pairing, NOT by position, so a batched external tool
      whose result lands first cannot be mistaken for it. Derivation FAILS CLOSED
      (untrusted) on a `null`/non-integer/out-of-window `resultIndex` or out-of-range
      `index`. The asserted flag may only RAISE the derived value.
- [ ] Indexes are trustworthy under the message cap: WP-080 rebases
      `index`/`resultIndex` to the retained `messages` (and drops window-split
      invocations), and this WP fails closed on any residual out-of-range value — so
      a padded session cannot push its poisoned window out of range and derive clean.
- [ ] Session keys and skill names flow only into `Map` lookups, string equality,
      and array indexing (never a path or shell string); the extracts read are
      exactly `expectedScratch`, already integrity-checked (WP-017).
- [ ] Codex sessions cannot authorize (no structured signal; text is spoofable by
      tool output) — WP-082 counts Claude sessions only. Documented as a v1 limit.

## Acceptance criteria

- [ ] `skills/wienerdog-dream/SKILL.md` documents invocation-binding, window-based
      trust (a windowed `tool_result` → untrusted; asserted flag raise-only), and
      the Codex-no-authorization v1 limit.
- [ ] `validate.js` reverts a ledger entry that counts a new Claude session absent
      from this run's extracts, or one that did not invoke the parent skill, or that
      asserts `derived_from_untrusted: false` while a bound session's window has an
      EXTERNAL `tool_result` (a batched result before the id-paired own result, or a
      `null`/out-of-window `resultIndex` → fail closed); it keeps a window with only
      the own paired result, a fully-bound clean-window entry, a back-to-back
      invocation whose neighbour's result stays out of the window, and an entry that
      honestly asserts `true`; a Codex session accumulates without an invocation
      check (all proven by the tests).
- [ ] Existing WP-081 ledger tests still pass (with the patched "valid ledger kept"
      test seeding invocations).
- [ ] `npm test` and `npm run lint` pass.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern 'dream-validate'
npm test -- --test-name-pattern 'dream-skill'
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The `skill_invocations` parser signal + its `index`/`resultIndex` fields and the
  cap-rebasing (`rebaseInvocations`) — **WP-080**.
- The ownership registry — **WP-083**.
- The base ledger validator (sibling/schema/append-only/monotonic) — **WP-081**;
  this WP only ADDS invocation-binding + window trust to it.
- WP-082's Claude-only authorization count and the `revision_pattern_key` gate —
  **WP-082** (it reads the now-trustworthy `derived_from_untrusted`).
- A structured Codex invocation signal (would let Codex sessions authorize) — a
  follow-up WP candidate; explicitly not in v1.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/084-ledger-evidence-trust-derivation`; conventional commits;
   PR titled `feat(dream): bind ledger learnings to skill invocations (WP-084)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

## Done record (2026-07-12)

Merged to main as `3d2f51e` (PR #83, squash). Double gate: wd-reviewer APPROVE
(invocationWindowTainted and the binding loop byte-match; SKILL.md prose
byte-exact; all four adversarial tests present — batched-external-result
taints, back-to-back invocations don't cross-attribute, null resultIndex fails
closed, Codex accumulation-without-authorization); Codex PR review clean.
The headEntries hoist and extended ledgerViolation signature were verified
behavior-neutral (82 prior dream-validate tests unmodified except the one
spec-authorized patch). Spec correction note: the part-(a) sketch's comment
labeled the binding loop `(c)` while part-(c) labels it `(h)` — implementer
correctly harmonized to `(h)`.
