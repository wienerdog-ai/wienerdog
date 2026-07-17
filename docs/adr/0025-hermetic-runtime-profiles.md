# ADR-0025: Hermetic runtime profiles — code-owned capability composition for the dream and every routine

Status: Accepted
Date: 2026-07-18

> **OWNER-APPROVED (2026-07-18).** The owner ratified this ADR in the A1
> walkthrough: every headless model job runs under a code-owned hermetic
> runtime profile composed into the argv by Wienerdog (no ambient-config
> inheritance, no arbitrary `skill:<string>` dispatch); the boundary statement
> stands as written (no arbitrary same-user claim — A12; executable identity
> is A7's; the GWS broker is A2's, A1 specs only the seam); no capability gate
> opens — `wienerdog safety` stays all-BLOCKED after every A1 WP; and the
> containment proof is the live negative harness on the pinned Claude version,
> never argv assertions alone. The open sub-questions under **§Open decisions**
> are resolved as dated `OWNER-APPROVED` blocks in the WP-128..WP-134
> walkthroughs before each WP moves to `Ready`; if a WP ruling changes a
> detail here, it lands as a dated amendment to this ADR (the ADR-0024
> convention).

## Context

Wienerdog runs two kinds of headless model job on the user's machine:

- the nightly **dreaming** job (ADR-0012) — `claude -p` reading the redacted scratch
  extracts and writing consolidated notes into the **vault**; and
- **routines** (ADR-0008) — scheduled `claude -p` jobs (daily digest, inbox triage,
  weekly review) that read external content (Gmail, Calendar) and act on it.

Both consume **fully attacker-influenceable content**: a transcript, an email, a
web page a session captured. The 2026-07-15 security audit (action **A1**,
`00-SYNTHESIS.md` RC1/R1) found the structural defect: **neither job defines its
own runtime capabilities**. The routine path (`run-job.js` `resolveCommand`)
dispatches a `skill:<name>` job as a bare `claude -p /<skill>` — Wienerdog specifies
no built-in tools, no allowed tools, no settings sources, no hook/plugin/MCP posture,
no filesystem roots. Whether that headless run can reach Bash, the network, arbitrary
files, a rogue MCP, or an inherited `SessionStart` hook depends entirely on the
user's **ambient** Claude configuration. Depending on ambient configuration *is* the
defect: a user with a permissive global Bash rule, a plugin, or an inherited hook
silently hands that authority to a hijacked routine.

The dream path is better — `buildClaudeArgs` already passes `--tools
Read,Write,Edit,Glob,Grep` (no Bash/WebFetch/WebSearch) and `--strict-mcp-config`
with no config (zero MCP servers) — but it is **not yet hermetic**: it passes
`--setting-sources user`, which imports the user's user-scope settings, including
**hooks and plugins**. A hook runs *outside* the model-selectable built-in tool list
and can have shell or network side effects that `--tools` never constrains. The
audit's corrected wording: the dream's model-selectable tool/MCP surface is strongly
constrained, but *full process containment remains unproven until it uses a dedicated
hook-free settings profile and passes live negative containment tests*.

Two hard local facts shape the fix:

1. **The word "sandbox" is already taken.** `src/core/sandbox-guard.js` is an
   *advisory* install-time check (it warns when `WIENERDOG_HOME` redirects the core
   but the harness config dirs are not co-redirected — the 2026-07-12 half-sandbox
   incident). It never contains anything. Calling the A1 boundary a "sandbox" would
   collide with that module and with the `GLOSSARY`/`safety-profile` note that already
   reserves "sandbox" for the redirect guard. This ADR uses **hermetic runtime
   profile** / **capability profile** throughout.
2. **`physicalPath()` / `sameDir()` in `sandbox-guard.js` are the blessed
   path-identity primitives** (realpath the longest existing ancestor, re-append the
   absent suffix; symlink/case-alias safe on APFS). A1's staging-directory containment
   reuses them; it does not reinvent path identity, and it does not remove or weaken
   `sandbox-guard.js` or the `doctor` hygiene checks.

**IRON RULE (ADR-0004): Wienerdog is just files.** A1 adds pure modules, on-disk
settings/skill assets, and argv/preflight/evidence logic at existing spawn sites. It
starts no daemon, server, or telemetry.

**A1 opens NO capability gate.** A1 is *containment machinery*, not authorization.
After every A1 WP, `wienerdog safety` must still show all five gates
(`google-setup`, `gws-use`, `external-content-routine`, `daily-summary-injection`,
`identity-auto-activation`) **BLOCKED**. The routine path stays frozen behind
`external-content-routine`; A1 builds the hermetic composition a routine *would* run
under and proves it contains, but it never lets a routine actually run in production.

## Decision

Every headless model job Wienerdog spawns runs under a **code-owned hermetic runtime
profile**: an in-repo object that fully specifies the job's capabilities, composed
into the `claude` argv by Wienerdog — never inferred from the user's ambient
configuration. There is no arbitrary `skill:<string>` dispatch and no ambient
authority inheritance.

### 1. Code-owned capability profiles + argv composer (WP-128)

A single pure module (`src/core/runtime-profile.js`) is the one place a capability
profile is defined. Each profile is a frozen, code-owned object naming: the profile
id (`dream`, `daily-digest`, `inbox-triage`, `weekly-review`), the allowed built-in
tool set, an explicit deny list (defense-in-depth), the MCP posture (dream: **empty**;
a routine: **exactly one** absolute-path local Wienerdog broker, or none), the
settings-profile reference, and the filesystem roots (`--add-dir`). A pure
`composeClaudeArgs(profile, ctx)` builds the exact argv. Routines are resolved by
**name against this code-owned registry**; an unknown or config-supplied
`skill:<string>` fails closed *before* any spawn. This supersedes `resolveCommand`'s
bare `claude -p /<skill>` (RC1).

### 2. Dedicated hook-free settings profile + vendored, integrity-checked skill text (WP-129)

A Wienerdog-owned settings profile (written idempotently under the core, 0600 via the
WP-126 private-fs writers) sets `disableAllHooks` and carries no user/project/local
sources. The job is spawned with **no ambient setting sources** and this profile as
its only settings input. `disableAllHooks` is **defense-in-depth, not a substitute
for excluding the source** (audit A1 point 4): the argv also excludes the user source
so a hook is never *loaded*, and the setting then guarantees any that slipped in
cannot fire. The skill body the job runs (the dream skill; a routine's skill) is
**vendored and integrity-checked** against a checked-in digest — Wienerdog does not
load an arbitrary user-scope slash skill at runtime (audit A1 point 2). A skill whose
bytes do not match the checked-in digest fails closed.

### 3. Fresh staging directory + bounded inputs + validated outputs (WP-130, WP-131)

- **Dream (WP-130):** the brain's `cwd` is a fresh, empty, Wienerdog-owned staging
  directory — **not the vault and not a user project** — so no project/local settings
  or `CLAUDE.md` under the cwd is ever discovered. The vault (write target) and the
  redacted scratch extracts (read-only inputs, already bounded by WP-118) reach the
  brain only through `--add-dir`. WP-017's diff validation and WP-069's scratch-intact
  gate remain the code guarantee over what is committed.
- **Routine (WP-131):** each routine run gets a fresh staging directory as its cwd and
  its only writable output channel; input snapshots are bounded; the routine's Google
  operations (if any) flow through **exactly one** absolute-path local broker MCP —
  the **A2 seam**, specified here as an interface only. Built-ins default to **none**;
  no general Bash, WebFetch, WebSearch, generic Read/Write, generic HTTP, or generic
  GWS CLI. The `external-content-routine` gate stays BLOCKED; the composition is built
  and tested, not run in production.

Staging-directory containment (a brain write must stay inside the declared roots;
symlink/`..` escapes are refused) reuses `physicalPath()`/`sameDir()`.

### 4. Managed-policy hook preflight + run evidence (WP-132)

- **Preflight (audit A1 point 7):** if a managed/admin policy can inject hooks that
  `disableAllHooks` cannot override, the unattended run **STOPs** with a fixed,
  fail-loud alert rather than running non-hermetically. There is no runtime opt to
  accept the policy in v1 (consistent with the A0 no-override posture); accepting a
  managed-policy runtime is a future reviewed decision.
- **Evidence (audit A1 point 8):** every hermetic run appends a bounded, secret-free
  record (0600) capturing the Claude version, the resolved absolute executable path,
  the profile id, the argv, the settings-file digest, and the MCP digest — so a run's
  actual runtime posture is auditable after the fact.

### 5. Live negative containment harness (WP-133)

The containment property is proven by a **live** negative suite (a real `claude -p`
run on the exact supported Claude version, subscription auth, WP-023 harness
precedent — gated behind `WIENERDOG_RUN_SCENARIOS`, never part of `npm test`). The
audit is explicit: *a finding is not fixed by a unit test that only asserts argv
strings.* The suite runs against the dream profile **and every catalog routine
profile** and asserts: an inherited user `SessionStart` hook that writes a canary
never fires; a permissive user Bash rule and a rogue MCP never appear in the tool
inventory; a malicious email demanding `curl`/Bash/token-reads/config-writes/MCP
leaves all canaries unchanged; the transcript contains only tools in the declared
set; reads of `~/.wienerdog/secrets`, harness settings, and arbitrary home files fail
before bytes return; writes outside staging/declared output fail before bytes change.
Unit tests assert profile/argv composition; the harness proves the runtime honors it.

### 6. Documentation (WP-134)

`THREAT-MODEL.md` (T1/T2 and the residual bullets), `GLOSSARY.md`, and any
README/VISION containment claim are rewritten to describe the hermetic runtime
profile precisely — no user hooks/plugins/MCP, dedicated hook-free settings, staging
containment — and to keep the "sandbox" word reserved for `sandbox-guard.js`. Claims
are made mechanically traceable to the enforced profile.

## Boundary statement (the A1 residual)

A1 contains the **model-selectable and configuration-inherited** capability surface:
a fully hijacked brain gets no Bash, no arbitrary network egress tool, no ambient
MCP, no user hook/plugin, no read of secrets/home, no write outside staging/vault.
It is **not** a claim against arbitrary same-user native code (ACTION-LIST A12): an
actor already executing as the user can read the same files and use the same
credentials regardless of any argv. A1 also relies on the runtime honoring the flags
— which is why the boundary is certified by the **live** harness on a pinned Claude
version, not by argv assertions alone. Executable-identity integrity (a fake `claude`
earlier on PATH, a mutated binary) is **A7's** boundary; A1 records the executable
identity in evidence but does not verify it. The GWS credential broker is **A2's**
boundary; A1 specifies only the single-broker MCP seam a routine profile plugs into.

## Scope boundary vs A2 and A7

- **A2 (GWS broker)** owns the credential-holding broker process, its typed verbs,
  grant enforcement, and least-scope credentials. A1 defines the routine profile's
  requirement of *exactly one* absolute-path local broker MCP (or none) and the
  interface seam; it does **not** build the broker, load OAuth, or make a routine
  functional. Until A2, catalog routines stay contained-but-inert and BLOCKED.
- **A7 (executable/scheduler integrity)** owns verifying the `claude`/`git` executable
  identity and binding the launch descriptor. A1 records the observed executable path
  and Claude version in run evidence but performs no integrity verification.

## Consequences

- Every headless model job's capability set is code-owned and inspectable in-repo; it
  no longer varies with the user's ambient Claude configuration. User plugins and
  convenient general tools intentionally disappear from unattended runs — that loss of
  ambient extensibility **is** the security property (the audit's stated tradeoff).
- Adding a routine means adding a code-owned profile + a live negative-harness case;
  there is no path to run a model job without a profile.
- The dream becomes hermetic (hook-free settings, staging cwd) the moment WP-130
  lands — the highest-value change, because the dream is the one job reachable today.
- Claude Code flag semantics (how to load the vendored skill with **no** user setting
  source, whether `disableAllHooks` overrides a managed-policy hook, the exact
  `--setting-sources` value that loads nothing ambient) are runtime/version-dependent;
  the profile fixes the *contract*, and the live harness on the pinned version is the
  proof. A Claude-version bump re-runs the harness before it is trusted.

## Open decisions (resolved in the WP walkthroughs)

1. **Dream cwd** — neutral staging dir vs the vault (D-DREAM-CWD, WP-130).
2. **Vendored-skill delivery without a user setting source** — `--append-system-prompt`
   vs a Wienerdog-owned settings/skills source dir (D-SKILL-LOAD, WP-129/WP-130).
3. **`--setting-sources` value that loads nothing ambient** — empty list vs a
   Wienerdog-only source (D-SETTING-SOURCES, WP-129).
4. **Managed-policy hook posture** — hard STOP with no accept-opt in v1 vs a code-owned
   accept constant (D-POLICY-HOOK, WP-132).
5. **Run-evidence executable identity depth** — path+version now vs binary content
   hash (defer hash to A7) (D-EVIDENCE, WP-132).
6. **Supported Claude version pin** — exact pin vs documented minimum + recorded
   tested version (D-CLAUDE-PIN, WP-133).
7. **Routine broker seam shape** — the exact interface a routine profile declares for
   its single A2 broker MCP (D-BROKER-SEAM, WP-131).

## Alternatives considered

- **Copy the dream's `--tools` flags onto routines and call it done.** Rejected: it
  ignores the inherited-settings hole (hooks/plugins via `--setting-sources user`) and
  gives GWS routines no controlled Google path — the audit's explicit "not a usable
  fix" (RC1).
- **Rely on `disableAllHooks` alone.** Rejected: the audit requires excluding the
  source, not just disabling what it loads; a disabled-but-loaded hook is one config
  bug from firing, and a managed-policy hook may ignore the flag.
- **Trust argv unit tests as the acceptance.** Rejected by the audit: only a live run
  on the pinned Claude version proves the runtime honors the flags.
- **Run Codex routines under `workspace-write`.** Out of scope (Codex containment is
  A11/P2, latent until M4); A1 targets the Claude path that is reachable now.
- **Build the GWS broker inside A1 so routines work end-to-end.** Rejected: the broker
  is A2's credential boundary; folding it in would couple two independently reviewable
  security boundaries and pull OAuth credential handling into the containment WP.
