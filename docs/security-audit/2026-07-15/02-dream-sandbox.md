# Wienerdog Security Audit — Dream-Job Code-Execution Containment / Sandbox Escape

> **Consensus correction (2026-07-15): this report preserves the first-pass
> evidence, but FINDING 1 and the original bottom line are superseded.** Direct
> verification against the installed Claude Code 2.1.210 CLI confirms that
> `--tools` is a real flag which restricts the available built-in tool set;
> `--strict-mcp-config` and `--setting-sources` are also present. Therefore the
> claim that the Claude dream brain's tool allowlist is inert is REFUTED. The
> remaining findings keep their evidence value with these consensus statuses:
> F2 = defense-in-depth gap (not a demonstrated dream escape), F3 = latent and
> unreachable in v1, F4/F7 = contained layout hardening, F5 = unresolved
> user-settings/hooks inheritance risk requiring a live negative test, and F6 =
> genuine lifecycle race. The canonical assessment and remediation gates live
> in `00-SYNTHESIS.md`; do not use this report's original Executive summary or
> Bottom line as the final verdict.

**Dimension:** Nightly "dream" brain containment — can a fully prompt-injection-hijacked
dream brain execute commands, reach the network, write outside the vault, or exfiltrate data?
**Date:** 2026-07-15
**Scope:** READ-ONLY audit of the actual invocation code. Target repo:
`/Users/felho/dev/repos-to-learn-from/wienerdog`.

## The containment claim under test

From `docs/THREAT-MODEL.md` T2: the headless dream run is *"tool-restricted — writes limited
to the vault and the run's scratch directory, no Bash, no network — so a fully hijacked dream
can at worst write gated markdown and scratch files … not execute or exfiltrate."* The claimed
enforcement is: (a) CLI tool-restriction flags at launch, and (b) code re-validation of the
post-run git diff.

## Executive summary (first-pass; superseded by the consensus correction above)

The **code-level post-run validation is genuinely strong for what it covers** (vault git diff +
scratch integrity, fail-closed Tier-3 / skill / ledger validators, symlink/`..` escape reverts,
robust locking). **But the runtime containment — the part that actually stops execution,
network, and out-of-vault writes — rests entirely on the Claude CLI launch flags, and at least
one load-bearing flag name is wrong.** The intended "authoritative tool allowlist" is passed as
`--tools`, which is **not** the documented Claude Code flag (`--allowedTools`). The post-run
validator does **not** re-check for command execution, network egress, or writes outside the
vault, so it does not backstop an escape the CLI sandbox fails to prevent.

Severity-ranked findings follow.

---

## FINDING 1 — REFUTED: wrong Claude tool-allowlist flag name (`--tools` vs `--allowedTools`)

**Severity:** HIGH
**File:line:** `src/core/dream/brain.js:52-53` (`'--tools', 'Read,Write,Edit,Glob,Grep'`);
comment claims it is the "AUTHORITATIVE built-in tool allowlist" at `brain.js:50-53`. Asserted
only by string-match tests: `tests/unit/dream-brain.test.js:16,72`.

**What the code does:** `buildClaudeArgs` launches the brain with `--tools
Read,Write,Edit,Glob,Grep`, described in-code as the authoritative allowlist that "Excludes Bash
(no shell), WebFetch/WebSearch (no network), and everything else."

**The defect:** The documented Claude Code headless flag to restrict tools to an allow-list is
`--allowedTools` (camelCase), with a complementary `--disallowedTools`. `--tools` is not a
documented flag or alias (verified against the official Claude Code docs — headless.md,
cli-reference.md, permissions.md). So the string `--tools Read,Write,Edit,Glob,Grep` is very
likely an **unrecognized option**. Its runtime effect is one of:
- **(a) CLI errors on the unknown flag** → the brain never starts → dream exits non-zero →
  `restoreVaultToHead` + fail-loud. Containment holds; the feature is silently broken (dream
  never consolidates). SAFE but the allowlist is doing nothing it claims.
- **(b) CLI ignores the unknown flag** → the brain runs with the **default** tool set (Bash,
  WebFetch, WebSearch, etc. present), and the intended deny of Bash/network is **not applied by
  this flag at all**.

**Exploit scenario (path (b)):** A hijacked brain in default-tool mode attempts Bash/WebFetch.
Whether that succeeds then depends on the permission layer — see Findings 2 and 4. Critically,
because `--setting-sources user` (`brain.js:64-65`) loads the user's own
`~/.claude/settings.json`, a user who has ever added a broad `permissions.allow` rule (e.g.
`Bash(*)`, `WebFetch`) — extremely common for power users — would grant those tools to the dream
brain, since no real allowlist is constraining it. Result: arbitrary command execution and
network egress from a hijacked nightly brain → read `~/.wienerdog/secrets/` OAuth tokens and
`~/.claude` credentials, exfiltrate over the network. The post-run validator (Finding 3) never
sees this.

**Exploitable-or-mitigated:** PARTIALLY MITIGATED by an unrelated, genuinely robust layer:
Claude Code headless mode denies any non-allowlisted / non-safe tool and **aborts the run** when
one is attempted (no TTY → no prompt → terminate), and `--permission-mode acceptEdits` only
auto-approves edits + a small safe filesystem command set in the working dir. So for a user with
a **default** (non-permissive) `~/.claude/settings.json`, even path (b) causes a hijacked brain's
first Bash attempt to abort the run rather than execute — containment effectively holds by
accident of the deny-by-default behavior, not by the (inert) allowlist. The exploit requires
either permissive user settings or a CLI that enables tools on an unknown flag.

**Confidence:** HIGH that `--tools` is the wrong flag name (`--allowedTools` is the documented
one). MEDIUM on end-to-end exploitability, because it hinges on (i) how the installed `claude`
binary handles an unknown flag and (ii) the user's `permissions.allow` — neither testable in a
read-only audit. No test in the repo spawns a real `claude` to confirm the flag is accepted or
enforced; the tests only assert the string is present in argv.

**Recommendation:** Rename to `--allowedTools`. Add a live smoke test that a hijacked-brain
fixture attempting Bash/WebFetch is actually denied. Do not rely on `--setting-sources user`
plus an allowlist flag to be conjunctive — verify the allowlist overrides user `permissions.allow`.

---

## FINDING 2 — Post-run validation does not cover execution, network, or out-of-vault writes; the "code re-validates" guarantee only re-validates the vault

**Severity:** HIGH
**File:line:** `src/core/dream/validate.js:696-873` (`validateAndCommit` inspects only
`changedPaths(vaultDir)` — the vault git diff — and `listFilesRecursive(scratchDir)`);
`src/cli/dream.js:257-274` (only scratch-integrity + vault validate run post-brain).

**What the code does:** After the brain exits, the orchestrator (1) reverts any scratch write,
(2) validates every path in the **vault** git diff against tier rules, reverting violations.
That is the entire "code enforces the boundary" mechanism.

**The gap:** The validator has no visibility into anything the brain did *outside the vault git
repo and the scratch dir*. It cannot detect, and does not attempt to detect:
- network egress (exfiltration),
- shell command execution,
- writes to `~/.wienerdog/config.yaml` (forge a send-grant → T4a exfiltration channel),
- writes to `~/.wienerdog/state/skill-registry.json` (the *tamper-proof* trust anchor the skill
  validators depend on — `validate.js:296-298`, "tamper-proof write-origin marker"),
- writes to `~/.claude/settings.json` or hooks (plant a hook → arbitrary code execution in the
  user's next **interactive** session).

`brain.js:40-41` is candid: *"These CLI flags are best-effort prevention; the guarantee is
WP-017's code validation."* But WP-017's code validation only guarantees the **vault**. So the
stated guarantee does not actually backstop the escape vectors (execution, network, out-of-vault
writes) that the CLI flags are supposed to prevent. If Finding 1's flag defect (or any future
CLI-sandbox regression) lets the brain write outside the vault, **nothing downstream catches it.**

**Exploit scenario:** Hijacked brain (given a tool escape per Finding 1/4) writes a forged send
grant into `~/.wienerdog/config.yaml`, or registers an attacker skill in
`state/skill-registry.json` so a later dream will "revise" (rewrite) its body with malicious
injected content that reaches the digest, or plants a `~/.claude` hook. None appear in the vault
diff; none are reverted; no alert.

**Exploitable-or-mitigated:** MITIGATED today only insofar as the CLI sandbox holds (parent-dir
writes are not auto-approved under `acceptEdits`, and out-of-workspace writes abort in headless
mode — see Finding 4). It is a **single point of failure**: the code layer that the threat model
presents as the real guarantee does not defend these assets. Defense-in-depth is absent.

**Confidence:** HIGH (direct reading of the validator's scope).

**Recommendation:** Add a post-run integrity check that the brain touched nothing under
`~/.wienerdog` except `state/dream-scratch/`, and nothing under `~/.claude` / `~/.codex`
(mtime/hash baseline of config.yaml, skill-registry.json, secrets/, settings files, captured
pre-brain and re-checked post-brain), failing loud on any change.

---

## FINDING 3 — Codex brain path grants full command execution and unrestricted reads; "no Bash / cannot exfiltrate" is false for Codex (latent — unreachable in v1)

**Severity:** HIGH (latent / currently unreachable)
**File:line:** `src/core/dream/brain.js:82-99` (`buildCodexArgs`: `--sandbox workspace-write`,
`-c sandbox_workspace_write.network_access=false`, `--cd vaultDir`, `--add-dir scratchDir`).
Never invoked: `src/cli/dream.js:109` calls `spawnBrain` with **no `harness`**, so
`brain.js:135-141` always defaults to Claude. `buildCodexArgs` has no production caller.

**The defect:** `codex exec --sandbox workspace-write` is a command-executing agent by design —
it runs shell commands, sandboxed only on *filesystem writes* (to cwd + `--add-dir` + tmp) and
*network* (disabled here). It does **not** disable command execution and does **not** restrict
**reads**. So the containment claim "no Bash, … can at worst write gated markdown … not execute
or exfiltrate" is simply not true for the Codex brain:
- it can execute arbitrary shell commands (subject to the write/network sandbox);
- reads are unrestricted → it can read `~/.wienerdog/secrets/*` OAuth tokens, `~/.claude`
  credentials, and every transcript;
- with network off, it can still **exfiltrate to git**: embed the read secrets into a Tier-1
  daily-log note inside the vault (a note passes validation as ordinary content), which then
  lands in the vault git repo — an asset the threat model itself notes may be shared/pushed.

`--cd vaultDir` is the write fence (the code comment at `brain.js:88` correctly notes `--add-dir`
does not fence `apply_patch`, citing openai/codex#24214), but a write fence does nothing about
command execution or unrestricted reads.

**Exploit scenario:** On a Codex install (once the path is wired up at M4), a hijacked brain runs
`cat ~/.wienerdog/secrets/*`, base64s it into a Tier-1 note; the note commits into the vault; the
user later pushes/shares the vault → credential exfiltration with network disabled the whole time.

**Exploitable-or-mitigated:** MITIGATED in v1 **only** because `dream.js` never selects the Codex
harness — `buildCodexArgs` is dead code. The code itself flags this as
"UNVERIFIED-until-live-M4-test" (`brain.js:76-77`). If/when Codex is enabled, this is a real
escape of the stated containment and must be re-designed (Codex's `workspace-write` is not
equivalent to Claude's tool-omission of Bash).

**Confidence:** HIGH on the Codex sandbox semantics and on the v1 unreachability.

**Recommendation:** Before wiring the Codex path, document that Codex containment is
*write-fence + network-off*, NOT *no-execution*, and add a read/exfiltration defense (e.g. run
the Codex brain in a sandbox whose read tree excludes `~/.wienerdog`, `~/.claude`, `~/.codex`
secrets; or drop Codex from the autonomous-write role).

---

## FINDING 4 — `--add-dir` extends the WRITE boundary (auto-approved under acceptEdits), not a read-only grant; scratch is a writable root inside the core dir

**Severity:** MEDIUM
**File:line:** `src/core/dream/brain.js:56-62` (`--add-dir vaultDir`, `--add-dir scratchDir`);
scratch resolves to `~/.wienerdog/state/dream-scratch` (`src/core/dream/scratch.js:16-19`,
`src/core/paths.js:39`).

**What the code assumes:** The comment at `validate.js:724-726` states "the `--add-dir` sandbox
prevents writes elsewhere in core/home." Per the official permissions docs, `--add-dir` grants
additional directories **the same read AND write** treatment as cwd; under `acceptEdits` those
writes are **auto-approved**. It is a write-boundary *expansion*, not a read-only grant. So the
brain has silently auto-approved write access to both `vaultDir` and
`~/.wienerdog/state/dream-scratch` — the latter a directory *inside the core dir*, one level below
`state/skill-registry.json` (the trust anchor) and two below `secrets/`.

**Why it is still contained today:** The same docs confirm `--add-dir` write access does **not**
extend to parent directories, so `state/skill-registry.json`, `~/.wienerdog/secrets/`, and
`~/.wienerdog/config.yaml` are outside the write boundary; a `scratchDir/../skill-registry.json`
write canonicalizes outside the granted subtree and (in headless mode) aborts rather than
succeeds. And every scratch write is reverted by Step-1 of `validateAndCommit`
(`validate.js:729-743`) with a byte-hash baseline.

**Exploit scenario (residual):** The containment of the trust anchor and secrets depends entirely
on the CLI honoring the "no parent-dir writes" rule. Placing a brain-writable root
(`dream-scratch`) inside the core dir, adjacent to the tamper-proof registry and the secrets dir,
is a defense-in-depth smell: any CLI-sandbox regression on parent traversal, or the flag-name
defect in Finding 1 degrading the permission posture, turns proximity into an escape.

**Exploitable-or-mitigated:** MITIGATED (parent-dir writes not granted; scratch writes reverted),
but fragile and mis-described in the code comment.

**Confidence:** MEDIUM. The write-vs-read semantics of `--add-dir` are confirmed from docs; the
"no parent write" guarantee is documented but not independently verified against the installed
binary here.

**Recommendation:** Move the dream scratch dir OUT of `~/.wienerdog` (e.g. a fresh
`os.tmpdir()` subdir per run), so no brain-writable root is ever a sibling/child of secrets or the
trust anchor. Correct the `validate.js:724-726` comment.

---

## FINDING 5 — `--setting-sources user` loads user-writable settings that can widen the brain's tools

**Severity:** MEDIUM
**File:line:** `src/core/dream/brain.js:63-65` (`--strict-mcp-config`, `--setting-sources user`).

**The issue:** `--setting-sources user` correctly excludes *project/local* settings under cwd (a
poisoned vault cannot widen tools via a checked-in `.claude/settings.json`), which is a good
choice. But it explicitly **includes** the user-scope `~/.claude/settings.json`. That file's
`permissions.allow` block, `enabledMcpjsonServers`, or hook config are all honored by the dream
brain. If the user has broad allow-rules (common), those apply to the unattended brain too —
compounding Finding 1 (with `--tools` inert, user allow-rules become the effective policy). It
also means a one-time compromise that plants an allow-rule or MCP server in user settings
persists into every future nightly run.

Additionally, `--strict-mcp-config` (intended, with no `--mcp-config`, to yield zero MCP servers)
could not be confirmed against current official docs in this audit; if its name/behavior has
drifted, MCP tools configured in user settings (potentially networked) could load. This flag is
not exercised by any live test.

**Exploit scenario:** User (or a prior injection) adds `WebFetch` / a networked MCP server to
`~/.claude/settings.json`; the nightly hijacked brain uses it to exfiltrate.

**Exploitable-or-mitigated:** MITIGATED for a clean default user config; exploitable for
permissive/compromised user settings. The correct project/local exclusion is a genuine strength;
the user-scope inclusion is the residual.

**Confidence:** MEDIUM (behavioral, depends on installed CLI + user settings).

**Recommendation:** Consider `--setting-sources` with the narrowest viable scope, or point
`CLAUDE_CONFIG_DIR` at a Wienerdog-owned minimal settings dir for the dream run so the brain never
inherits the user's interactive allow-rules. Verify `--strict-mcp-config` is still valid, or
switch to an explicit empty `--mcp-config`.

---

## FINDING 6 — Nested detached process groups: the outer run-job watchdog cannot kill the brain; a hijacked brain can outlive the timeout

**Severity:** LOW-MEDIUM
**File:line:** `src/cli/run-job.js:483-489` (spawns the `wienerdog dream` node process
`detached: true` → own group) and `src/cli/run-job.js:505` (`killProcessTree(child.pid …)` →
`kill(-pid)` of *that* group); vs `src/core/dream/brain.js:144-149` (spawns the brain
`detached: true` → a **separate** group) and `src/cli/dream.js:117` (inner watchdog kills
`-child.pid`, the brain group). Timeouts are equal: dream job `timeoutMinutes: 20`
(`src/cli/schedule.js:304`) and `cfg.timeoutMs` default 20 min (`src/core/dream/config.js`).

**The issue:** Two independent watchdogs guard two independently-detached process groups. The
inner one (dream.js, 20 min) correctly group-kills the brain. The outer one (run-job, 20 min)
group-kills only the *dream node* process group — the brain, being in its **own** detached group,
is **not** a member and survives an outer kill. Because both timeouts are 20 minutes, they race:
if the outer watchdog fires first and SIGKILLs the node process, dream.js's inner `setTimeout` dies
with the process, so nothing ever kills the brain group → **the brain is orphaned and outlives the
watchdog**, violating ADR-0004 ("nothing it starts outlives the job").

**Exploit scenario:** A hijacked or wedged brain keeps running (burning quota / holding resources /
continuing whatever it was doing) after the job "timed out" and was reported killed. It remains
sandbox-limited, so this is a lifecycle/containment-of-runtime defect, not a privilege escalation.

**Exploitable-or-mitigated:** Partially mitigated by the normal case (inner watchdog usually wins
or the brain exits on its own). The orphaning is a genuine race window inherent to the
double-detached design.

**Confidence:** MEDIUM (process-group reasoning from the spawn flags; exact scheduler timing not
executed here).

**Recommendation:** Have the outer watchdog kill by the actual process tree (not assume the brain
shares the node's group), or don't double-detach — let the brain share the dream node's group so a
single group-kill reaches everything, or make the inner timeout strictly shorter than the outer.

---

## FINDING 7 — Trust anchor and secrets sit adjacent to a brain-writable path (defense-in-depth smell)

**Severity:** LOW / INFO
**File:line:** `src/core/paths.js:36-47` (`state`, `secrets` under `core`);
`src/core/dream/scratch.js:17-19` (scratch = `state/dream-scratch`);
`src/core/dream/skill-registry.js:7-9` (`state/skill-registry.json`).

**The issue:** The skill-ownership registry — explicitly the *tamper-proof* trust root that lets
`validate.js` decide which skills the dream may rewrite — lives at
`~/.wienerdog/state/skill-registry.json`, i.e. the **parent** of the brain-writable
`state/dream-scratch`. OAuth tokens live one more level up at `~/.wienerdog/secrets/`. Colocating a
brain-writable directory beneath the same `state/` tree as the trust anchor means the only thing
separating "reverted scratch write" from "forged skill ownership" is the CLI's parent-traversal
rule. If the brain could ever forge `skill-registry.json`, it could register an attacker-authored
skill as dream-owned, then have a later dream "revise" its body with injected instructions that
reach the injected digest / are invoked by future sessions.

**Exploitable-or-mitigated:** MITIGATED today (parent-dir writes not granted under `acceptEdits`;
headless out-of-workspace writes abort). Flagged as a layout hardening opportunity, dependent on
Finding 4's recommendation.

**Confidence:** HIGH that it is currently contained; INFO-level structural observation.

---

## Where containment is genuinely solid (credit)

- **No post-run execution of brain output.** Nothing sources, evals, or runs anything the brain
  wrote. Synthesized `SKILL.md` is plain markdown written `status: incubating`, subject to the
  fail-closed Tier-3 floor (`validate.js:171-198`) and only *invoked later by the user's own
  sessions* if they use it — the dream never executes a synthesized skill. Skill **revision** is
  tightly gated (ownership registry + committed-learning authorization + invocation-window taint
  check, `validate.js:280-368,442-565`) and fails closed on every malformed input.
- **No argument/env injection into the harness command line.** Extracts reach the brain only as
  files it reads and as a single positional prompt string (`brain.js:22-34,46-72`); `model`/paths
  are individual argv array elements (never a shell string), so even a hostile `dream_model`
  cannot inject a second flag. `config.yaml` is a trusted mechanics surface. `spawn` is called with
  an argv array, never `shell:true`, for the brain.
- **Untrusted content is framed as data.** `skills/wienerdog-dream/SKILL.md:22-29` explicitly
  quarantines transcript/`tool_result` text as quotes-never-instructions; provenance is computed
  mechanically, and the code (not the model) enforces the tier boundary on the vault diff.
- **Strong vault-diff validation.** Symlink/`..` escapes out of the vault are canonicalized and
  reverted (`resolveContainment` `validate.js:576-603`, applied `758-765`); scratch writes are
  reverted with a byte-hash baseline (`729-743`); one commit per dream → `git revert` undoes a
  night; every revert is written into a human-readable report.
- **Robust concurrency/locking.** The lock is acquired *before* any scratch mutation
  (`dream.js:162-166`), a non-acquiring dream is a pure no-op, catch-up dreams no-op under a held
  lock, and the scratch-integrity + watermark gate (`dream.js:220-263`) provably prevents the
  2026-07-07 "second dream wiped live inputs" race from advancing a watermark on empty inputs.
- **Headless deny-by-default is a real secondary layer.** Even if the allowlist flag is inert
  (Finding 1), Claude Code headless mode aborts the run when a non-allowlisted / non-safe tool is
  attempted, so a default-config user's hijacked brain trying Bash fails safe rather than executing.

## Bottom line (first-pass; superseded by `00-SYNTHESIS.md`)

The **code re-validation of the vault is solid and adversarially designed.** The weakness is that
the threat model's "at worst write gated markdown … not execute or exfiltrate" guarantee depends on
**launch-flag runtime containment that is (a) mis-named for Claude (`--tools` ≠ `--allowedTools`),
(b) not equivalent to "no execution" for Codex, and (c) not backstopped by the post-run validator
for anything outside the vault.** The most urgent, concrete defect is the `--tools` flag name;
the most structurally important gap is that the code layer presented as the real guarantee never
checks for execution, network, or out-of-`~/.wienerdog`/`~/.claude` writes.
