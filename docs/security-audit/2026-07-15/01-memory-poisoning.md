# Wienerdog Security Audit — Persistent Prompt Injection / Memory Poisoning

> **Consensus status (2026-07-15): confirmed and release-blocking.** F1 is a
> core safety failure, not a sufficient "accepted residual": brain-authored
> provenance numbers cannot authorize identity content that is injected into
> future sessions. Independent session re-derivation improves the autonomous
> path but cannot prove that the new prose is entailed by those sessions. The
> safe default is therefore pending identity proposals plus explicit human
> approval bound to the proposed bytes; autonomous identity promotion remains
> an optional weaker mode. F2/F3 are one root cause and are raised to P0 because
> they provide a low-precondition, albeit transient, injection path. Until a
> stronger design lands, the newest daily Summary must not enter the injected
> digest. Canonical remediation and acceptance gates: `00-SYNTHESIS.md` and
> `ACTION-LIST.md`.

**Dimension:** T1 — Persistent prompt injection / memory poisoning (the project's self-declared defining threat)
**Target:** Wienerdog (`/Users/felho/dev/repos-to-learn-from/wienerdog`)
**Date:** 2026-07-15
**Scope:** Read-only source audit. Can untrusted transcript content (tool_result = email/web/file) escalate to durable influence over future sessions — i.e. reach Tier 3, the injected digest, identity, or a synthesized/revised skill?

## Executive summary

The system is genuinely well engineered and the skill-revision / LEARNINGS path is one of the strongest code-enforced provenance boundaries I have seen. The **role classification is not forgeable by transcript content** (only by writing transcript files directly), and the **skill-body-revision path independently re-derives provenance** and cannot be poisoned via `tool_result` content.

The soft spot is the **identity Tier-3 path** (the four files that feed the injected digest). Unlike skills, identity notes get **no independent re-derivation, no HEAD comparison, no session-binding, and no ownership registry** — all three Tier-3 conditions are read straight from brain-written frontmatter. This is a *documented, accepted* residual, but the threat model's "defense-in-depth" framing overstates the remaining protection (recurrence and confidence are cited as barriers but are not actually verified for identity notes). A secondary, less-recognized path is the **daily-log → digest injection**, which has no code provenance gate at all and depends on an under-specified file-level flag.

Ranked findings follow, most-severe first.

---

## F1 — Identity Tier-3 gate is pure frontmatter trust: no re-derivation, no HEAD compare, no session-binding (HIGH; documented/accepted residual, but broader than documented)

**Severity:** HIGH (accepted residual — but the accepted framing understates it)
**Confidence:** High (this is the actual code behavior; partly acknowledged in the threat model)

**File:line:**
- `src/core/dream/validate.js:171-198` — `tier3Decision()` (the only gate for identity-dir writes)
- `src/core/dream/validate.js:783-806` — the Tier-3 branch in `validateAndCommit()`
- `src/core/digest.js:240-282` / `253-259` — the four identity files are injected into every session
- `docs/THREAT-MODEL.md:181` — the accepted-residual statement

**What the code does.** For any changed path under `identity_dir`, `validateAndCommit` runs `skillBodyViolation` (returns null for identity notes — it only governs `SKILL.md`) and then `tier3Decision`. `tier3Decision` reads the file's own frontmatter and checks exactly three fields:

```js
const confidence = Number(fm.confidence);
const recurrence = Number(fm.recurrence);
const untrustedFalse = fm.derived_from_untrusted === false;
const ok = untrustedFalse && confidence >= 0.85 && recurrence >= 3;
```

There is **no** cross-check of any of these against the actual extracts, **no** comparison against the file's HEAD version, and **no** binding of the claimed recurrence to real distinct sessions. Contrast this with:
- the LEARNINGS ledger path (`ledgerViolation`, `validate.js:471-565`), which **re-derives** `derived_from_untrusted` from the invocation window (`invocationWindowTainted`) and **binds** counted sessions to real skill invocations (step h, `validate.js:545-563`);
- the skill-body path (`skillBodyViolation`, `validate.js:280-368`), gated by a tamper-proof ownership registry and a HEAD-vs-current comparison.

Identity notes get **none** of these. They are the weakest Tier-3 surface, yet they feed the digest most directly (`profile.md`, `preferences.md`, `goals.md`, `instructions.md` — `digest.js:243-248`).

**Exploit scenario (the documented residual):**
1. Attacker plants instruction-shaped text in an email/web page a session reads (→ a `tool_result` message).
2. During the nightly dream the brain is steered by that content (T2 confused-deputy — the very hijack the pass is meant to survive).
3. The hijacked brain writes/overwrites `06-Identity/instructions.md` with attacker content and frontmatter `derived_from_untrusted: false`, `confidence: 0.9`, `recurrence: 3`.
4. `tier3Decision` reads those three literals, all pass → the write is committed.
5. `renderDigest` injects the file's body into `state/digest.md` → every future SessionStart runs under attacker influence. Durable.

Note the brain can also **wholesale-overwrite an existing** trusted identity file this way: because there is no HEAD comparison for identity notes, replacing the entire body of `preferences.md` while keeping `derived_from_untrusted: false` is accepted — nothing checks that the new body is justified by real recurring trusted content.

**Exploitable or mitigated:** Exploitable *if the brain is hijacked*; this is explicitly accepted (`THREAT-MODEL.md:181`) with defense-in-depth (sandbox denies Bash/network; one revertible commit; readable report; scenario harness plants a real injection). **However, the documentation overstates two of those defenses for the identity path specifically:**
- The residual text says "recurrence ≥3 requires multi-session persistence of the attack." For **identity notes this is false** — `recurrence` is an unverified frontmatter integer; the brain writes `recurrence: 3` with a single supporting session (or zero). Only the *ledger* path ties recurrence to distinct verified sessions.
- Likewise `confidence` is an unverified self-assigned float.

So for the identity/digest path, **all three** Tier-3 conditions collapse to "the brain wrote the right literals," and the only real barrier is that the brain must be induced to write them — i.e. the boundary is the sandbox + honest-brain assumption, not the numeric gate.

**Recommendation direction (not built in v1, per the ADR):** the identity path deserves the same independent re-derivation the ledger path already has — at minimum, re-derive `derived_from_untrusted` for identity notes from the `source_sessions` listed in frontmatter cross-referenced against this run's extracts (the same `extractsBySession` map already built at `validate.js:749-755`), and verify `recurrence` == distinct verified `source_sessions`.

---

## F2 — Daily-log → digest injection has no code provenance gate; file-level flag is under-specified for mixed-provenance logs (MEDIUM)

**Severity:** MEDIUM
**Confidence:** Medium (depends on brain's aggregation of the daily-log file flag, which the skill does not pin down)

**File:line:**
- `src/core/digest.js:266-271` — newest daily note's `## Summary` section is injected
- `src/core/digest.js:49-59` — `readNote` excludes a note only when `derived_from_untrusted === 'true'` (exact string)
- `src/core/digest.js:19-41` — `splitFrontmatter`: a **missing** flag ⇒ not excluded ⇒ included
- `src/core/dream/validate.js:807-808` — daily logs hit case (c): "Tier-1/2 note, daily log, or report → keep" (no gate at all)
- `skills/wienerdog-dream/SKILL.md:112-114, 142-169` — Tier-1 daily-log rules; the file-level `derived_from_untrusted` aggregation rule is spelled out **only for ledgers** (`SKILL.md:296`), not for daily logs

**What the code does.** `renderDigest` always injects the `## Summary` section of the newest daily note (`digest.js:266-271`). The only guard is `readNote`, which drops the note **only** if its file-level frontmatter parses to the exact string `'true'`. `validateAndCommit` performs **no** validation on daily logs — they are kept unconditionally (case c). So the entire provenance decision for injected daily content rests on one brain-written file-level flag, with **no code enforcement** that the flag is present or correctly aggregated.

The daily log is a Tier-1 destination: `confidence ≥ 0.5`, single session sufficient, and **untrusted-derived content is explicitly allowed** in Tier 1 (`THREAT-MODEL.md:43`, `SKILL.md:112-114`). A daily log aggregates *many* candidates of mixed provenance under **one** frontmatter block, and the skill never states "set the daily-log file flag true if any entry is untrusted" (it states exactly that only for `LEARNINGS.md`).

**Exploit scenario:**
1. Attacker plants a short, plausible-looking fact/instruction in an email (→ `tool_result`).
2. The (honest, non-hijacked) brain extracts it as a candidate with `confidence ≥ 0.5` and correctly marks *that candidate* `derived_from_untrusted: true`, routing it to the Tier-1 daily log.
3. The daily log also contains genuine trusted user content, so the brain sets the **file-level** `derived_from_untrusted: false` (dominant content is trusted) — or omits/varies the field, since the skill gives no explicit aggregation rule for daily logs. It writes a line reflecting the untrusted content into the `## Summary` section.
4. `readNote` sees `'false'` (or a missing field) → does **not** exclude the note → the `## Summary` (containing untrusted-derived text) is injected into `state/digest.md`.
5. Every session that day starts with the attacker's content in its digest.

**Exploitable or mitigated:** Partially exploitable. It is **transient** (the digest only injects the *newest* daily note, so the influence lasts ~one day and rotates out) rather than durable Tier-3, which is why it is MEDIUM not HIGH. But it reaches the T1 asset (the injected digest) **without requiring a fully hijacked brain** — only an under-specified provenance-aggregation decision. This is materially different from F1's "hijacked brain" residual: it can occur under an honest brain following ambiguous instructions. The threat-model claim (`:43`) that untrusted Tier-1 content "is excluded from digest rendering" holds only if the daily-log file flag is honestly `true`, which the skill does not reliably require and code does not enforce.

**Recommendation direction:** either (a) never inject daily-log content into the digest (only the four identity files), or (b) have the digest exclude a daily note unless its file flag is *explicitly* `false` AND add a code rule in the dream orchestrator that recomputes/forces the daily-log file flag to `true` when any entry is untrusted.

---

## F3 — Two independent, divergent frontmatter parsers; digest defaults to "include" on a missing/odd flag (LOW / latent)

**Severity:** LOW (latent divergence + fail-open default; no live widening exploit found for the identity files)
**Confidence:** Medium that it is a latent risk; Low that it is currently exploitable

**File:line:**
- `src/core/digest.js:19-41` — `splitFrontmatter`: key regex `^([A-Za-z0-9_]+)` (**no hyphens**), value truncated at the **first** `#` anywhere, compared as the **string** `'true'`
- `src/core/dream/validate.js:120-163` — `parseFrontmatter`: coerces unquoted `true`/`false` to **booleans**, strips comments only at `' #'` (space-hash), honors quotes, skips indented lines
- `src/core/dream/config.js:16-41` — a *third* flat-scalar reader

**What the code does.** Provenance is read by at least three hand-rolled parsers with different rules. The security-relevant divergence is between the **acceptance** gate (`validate.js` `parseFrontmatter`, boolean-coercing) and the **injection** gate (`digest.js` `splitFrontmatter`, string-compare). For an identity file to be accepted into Tier 3 it must carry literal unquoted `derived_from_untrusted: false`; the digest then reads `'false'` → includes it — consistent, so I did **not** find a value that both passes Tier-3 acceptance *and* flips the digest's decision in the attacker's favor for the four identity files.

The residual concerns:
- **Fail-open default in the digest.** `readNote` excludes only on the exact string `'true'`. A note with a **missing** flag, `True`, `"true"`, or `yes` is **included**. For the four Tier-3 identity files this is backstopped by `tier3Decision` (which requires the field present and boolean-`false`), but for the **daily log** — which has no `tier3Decision` gate (see F2) — a missing/odd flag means "inject." That is the fail-open leg F2 relies on.
- **Duplication risk.** Three parsers with subtly different grammars is exactly the kind of thing that silently diverges on the next edit; a future change to one and not the others could open a real accept-vs-inject gap.

**Exploitable or mitigated:** Not independently exploitable today for the identity files; it is the enabling mechanism for F2's daily-log leg. Flagged so it is not re-investigated as a standalone bug and so the fail-open default and parser duplication are on record.

---

## F4 — "Distinct session" authenticity for skill-revision rests entirely on transcript files, which a local process can fabricate (LOW; same OS-user boundary as T4)

**Severity:** LOW (accepted local-attacker/file-permission boundary)
**Confidence:** High on the mechanism; it is the accepted local boundary

**File:line:**
- `src/core/transcripts/claude.js:103, 141-153` — `session_id` from `obj.sessionId`; `skill_invocations` from assistant `tool_use` `{name:"Skill"}` blocks — all read from the on-disk JSONL
- `src/core/dream/validate.js:545-563` — ledger step (h): a newly-counted `claude:` session must be in this run's extracts AND its extract must contain an invocation of the parent skill
- `src/core/dream/validate.js:361-365` — needs ≥ 3 distinct `claude:` sessions to authorize a skill-body revision

**What the code does.** The recurrence-≥3 authorization for a *skill-body revision* is strong against transcript **content**: the injection payload arrives via `tool_result`, and `invocationWindowTainted` (`validate.js:442-459`, fail-closed) raises the entry to untrusted if any external `tool_result` sits in the invocation window — so poisoned content in the window cannot authorize a revision. **But** the notion of a "distinct session" is only as trustworthy as the transcript files: `session_id` and `skill_invocations` are parsed from `~/.claude/projects/*/*.jsonl`, which have no authenticity marker.

**Exploit scenario:** a co-resident process (or the user tricked into placing files) writes three hand-crafted Claude rollout JSONL files, each containing a fabricated `{"type":"assistant", ... "tool_use" name:"Skill" input.skill:"<target>"}` block, benign `user`/`assistant` messages, and **no** `tool_result` in the window. On the next dream these three "sessions" satisfy the ≥3-distinct-Claude-invocation authorization, letting a matching LEARNINGS entry + `revision_pattern_key` authorize a body revision of a dream-created skill.

**Exploitable or mitigated:** Mitigated to the extent that it requires **write access to the transcript directory** — the same OS-user file-permission boundary that already guards the OAuth tokens (T4) and that the threat model accepts elsewhere (T4a residual). It is **not** reachable via `tool_result` content alone (that is well-defended). Reported because question 4 asks whether "distinct session" is spoofable: **yes, by anyone who can write the transcript files; no, by controlling transcript content that flows through tool_result.** There is no cryptographic session authenticity.

---

## F5 — Codex `developer` role is mapped to trusted `user`; correctness depends on a version-pinned, unverifiable-forever assumption (LOW/INFO; documented residual)

**Severity:** LOW / INFO (documented, accepted; CI only catches part of it)
**Confidence:** Medium

**File:line:**
- `src/core/transcripts/codex.js:57` — `TRUSTED_MESSAGE_ROLES = new Set(['user', 'developer'])`
- `src/core/transcripts/codex.js:102-117` — `mapCodexItem`: `developer` → `role:'user'` (trusted); unknown role → `null` (dropped, fail-closed)
- `docs/THREAT-MODEL.md:30-42` — the parser-provenance residual

**What the code does.** The Codex parser fails **closed** on unknown `message` roles (dropped, never defaulted to trusted) — good, and it correctly routes the known tool-output *item types* to `tool_result`. But it **whitelists `developer` as trusted**, on the stated basis that in codex-cli 0.144.1 `developer` is Codex-authored scaffolding, "NOT tool-derived." Upstream `Message.role` is an untyped string with no schema.

**Exploit scenario / residual:** if a future Codex build ever routes any external or tool-influenced content through a `developer` (or any other role later added to the allowlist) message, that content is absorbed as trusted `user` text, becoming eligible for the "explicit user signal" ranking bump (`SKILL.md:92`) and losing its untrusted tag. The CI golden fixture (WP-100) catches the **removal of a known tool-output type**, but would **not** catch a genuinely new trusted-looking `message` role carrying external content.

Importantly, an attacker **cannot** forge a `user`/`developer` role from transcript *content* today: tool results are structurally distinct item types (`custom_tool_call_output`, etc.), never `type:"message"`, so email/web text the attacker controls cannot masquerade as a `message` role within an honest session. The exposure is a **future Codex protocol change**, not a present content-level forge.

**Exploitable or mitigated:** Not exploitable on the pinned Codex version; a named accepted residual tied to the next Codex pin bump. Reported to answer question 3 concretely: **role forging via transcript content is not possible; the only live trust-widening on Codex is the `developer` allowlist entry, which is a version-dependent assumption.**

---

## F6 — Consolidation / update-in-place: no content-provenance lineage, so a single-session untrusted note can be laundered into identity in one step (INFO; subsumed by F1)

**Severity:** INFO (a facet of F1)
**Confidence:** High on the mechanism

**File:line:** `src/core/dream/validate.js:171-198` (identity gate reads only the new file's frontmatter); `skills/wienerdog-dream/SKILL.md:172-191` (update rules are model-enforced only).

**What the code does.** When the brain "consolidates" — reads an existing untrusted-flagged Tier-1/2 note and writes its substance into an identity file — nothing in code links the identity content back to its untrusted source. The identity gate only inspects the destination file's frontmatter. The skill's "raise-only" and "preserve provenance" rules (`SKILL.md:185-191`) are **model-enforced**, not code-enforced, for identity notes (unlike ledgers, which get code-enforced raise-only vs HEAD at `validate.js:517-519`). So laundering — take untrusted content, drop it into `preferences.md` with `derived_from_untrusted: false` — is accepted by the code as long as the numeric literals are right. This is the same root cause as F1 (no independent provenance analysis for identity notes); listed separately because it directly answers question 7: **provenance can be laundered upward on consolidation, and no code prevents it — only the honest-brain assumption does.**

---

## Solid defenses (verified — do not re-investigate)

These held up under adversarial reading; treat them as genuinely strong:

1. **Skill-body revision path is well-defended end-to-end** (`validate.js:280-368` `skillBodyViolation`, `442-459` `invocationWindowTainted`, `471-565` `ledgerViolation`). To poison a dream-created skill's body an attacker would need ≥3 distinct **real Claude sessions** that each invoked the target skill with **no external `tool_result` in the invocation window** — but injection payloads arrive via `tool_result`, which taints the window and forces the entry to `derived_from_untrusted: true` (fail-closed on any malformed geometry). `derived_from_untrusted` here is **independently re-derived in code** from the extracts, never trusted from frontmatter. Codex sessions are structurally excluded from authorization (`validate.js:361`, `SKILL.md:333-337`). This is the model to replicate for identity notes.

2. **Ownership registry is outside the brain's write sandbox.** `skill-registry.json` lives in `state/` (`skill-registry.js:7-9`, `paths.js:40`), while the brain's `--add-dir` grants are `vault/` + `state/dream-scratch/` only (`brain.js:56-62`; scratch is `state/dream-scratch`, a *subdir*, per `scratch.js:16-18`). The brain cannot forge or edit registry entries; `recordSkills` is called by the orchestrator **after** the commit and only for newly-detected untracked skill drafts (`validate.js:801-804, 864`). Path reuse is caught by id/created cross-checks (`validate.js:313, 486-487`).

3. **Injected digest is written by code, not the brain.** `state/digest.md` is rendered by `renderDigest` and written by the orchestrator (`dream.js:282-283`), outside the brain's `--add-dir`. Non-vault digest content (alerts, update line) is fixed-template control-plane text (`digest.js:198-219`, `THREAT-MODEL.md:47-53`). The brain cannot write the digest directly.

4. **Role classification is not forgeable by transcript content.** In both harnesses, `tool_result` provenance is a structural property (Codex: distinct item `type`s, `codex.js:63-69`; Claude: `tool_result` content blocks inside user messages, `claude.js:112-128`), not something the attacker-controlled *text* can flip. Codex fails **closed** on unknown roles (`codex.js:111`). Claude `isMeta` user messages are dropped (`claude.js:107`).

5. **Scratch integrity with content hashes** (`validate.js:729-743`) deletes any brain write into the read-only scratch dir and detects byte-level mutation of the extracts that WP-084's session-binding relies on — closing the "brain tampers with its own evidence" loop.

6. **Ledger (LEARNINGS.md) enforcement is thorough**: append-only vs HEAD, immutable First-Seen/Observation, raise-only `derived_from_untrusted`, Session-IDs append-only (can't swap ids to mint recurrence), recurrence tied to distinct-id count and non-regressing, Status only `open→resolved` (`validate.js:409-427, 505-563`). Fails closed when HEAD is unreadable or the registry is absent.

7. **Structural containment**: symlink/`..` escape detection with deepest-existing-ancestor realpath resolution (`validate.js:576-603`), per-item revert (never abort the run), one commit per dream, readable revert report. Brain sandbox denies Bash/network/MCP (`brain.js:46-72`).

---

## Answers to the seven posed questions (concise)

1. **Is `derived_from_untrusted` computed mechanically by code?** Only for **LEARNINGS ledgers** (re-derived from invocation windows, `validate.js:558-562`). For **identity notes it is NOT** — `tier3Decision` trusts the brain-written frontmatter (`validate.js:189`). It can be lowered on an identity update because there is no HEAD comparison for identity notes (raise-only is code-enforced only for ledgers/skills). → **F1.**
2. **Does the post-dream re-validation re-derive independently?** For ledgers/skills, yes (independent). For identity notes, **no** — it trusts frontmatter and checks three literals only. → **F1.**
3. **Role forging (Codex untyped role)?** Not via transcript **content** (tool results are structurally distinct item types; unknown roles fail closed). The only trust-widening is the `developer` allowlist entry, a version-pinned assumption. → **F5.**
4. **Manufacture recurrence≥3?** For the skill-revision path, not via `tool_result` content (window taint blocks it); "distinct session" is spoofable only by writing transcript files directly (OS-user boundary). For **identity notes, recurrence is unverified frontmatter** — no manufacturing needed, just write `recurrence: 3`. → **F1, F4.**
5. **Explicit-capture / Inbox path.** No standalone "remember this → Inbox" hook is implemented in the dream pipeline (GLOSSARY describes it conceptually; `00-Inbox` is just a Tier-2 dream destination). Inbox notes are ordinary Tier-2 notes; promoting them upward is the F6 laundering case, gated only by the honest brain.
6. **Malicious skill synthesis / LEARNINGS self-revision / forgeable registry?** Skill *synthesis* is Tier-3-floored; *revision* is strongly gated (solid defense #1); the registry is **not** forgeable by the brain (solid defense #2). This path is robust.
7. **Consolidation laundering?** Yes for identity notes — no content lineage; the code accepts laundered content if frontmatter literals are right. → **F6/F1.**

**Bottom line:** the durable-influence risk concentrates in the **identity → digest** path (F1), where the Tier-3 gate is entirely frontmatter-trusting and the accepted-residual documentation overstates the recurrence/confidence protections. The **daily-log → digest** path (F2) is a second, honest-brain-reachable leak into the injected digest. Everything touching skills/ledgers is genuinely hard to poison.
