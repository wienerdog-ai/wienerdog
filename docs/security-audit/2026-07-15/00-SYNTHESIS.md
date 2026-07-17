# Wienerdog Security Audit — Consensus Synthesis

**Consensus revision:** 2026-07-15  
**Target:** Wienerdog @ commit `405afdd` (clean tree, re-verified)  
**Status:** pre-remediation, **NO-GO for use with personal GWS data or unattended
external-content routines; NO-GO for trusted automatic identity memory**  
**Goal:** turn the audit into an implementable safety program, then reassess
Wienerdog for personal use. The tool is intentionally not being used before the
P0 gates below close.

## How to read this audit package

- This file is the canonical risk, reachability, and go/no-go assessment.
- `ACTION-LIST.md` is the canonical remediation design and acceptance-gate list.
- `01`–`07` preserve the dimension evidence. Their top-level consensus notices
  supersede first-pass severity or bottom-line wording where the later
  cross-check changed it.
- A finding is not considered fixed by prose, a unit test that only asserts argv
  strings, or a hash whose trust anchor is stored in the same attacker-writable
  data. The relevant adversarial acceptance gate must execute.

## Security target and threat boundary

The primary target is **agent safety**, not protection from arbitrary native
malware already executing as the user.

Assume that:

1. email, web pages, repository files, MCP/tool results, and transcript content
   may be malicious;
2. that content may fully steer the model inside any capability the runtime
   exposes;
3. unattended jobs receive no human judgment at the point of action;
4. the vault, Google data, OAuth credentials, future-session instructions,
   ordinary user files, and scheduled execution are high-value assets;
5. the user may have permissive global Claude settings, so Wienerdog may not
   inherit an ambient permission posture and call it a sandbox.

The target properties are:

- **S1 — capability containment:** a fully hijacked brain cannot obtain shell,
  arbitrary filesystem, arbitrary network, user-hook, plugin, or ambient MCP
  authority.
- **S2 — mediated external effects:** an agent never receives raw GWS
  credentials. Every read, draft, send, or calendar mutation flows through a
  narrow broker that enforces the verb, authenticated job identity, and grant.
- **S3 — ratified durable memory:** brain-authored metadata cannot authorize
  content injected into future sessions. Instruction/identity bytes require an
  independent trust record and, by default, explicit human approval.
- **S4 — credential non-persistence:** recognized secrets cannot reach committed
  vault notes, durable logs, the digest, or managed harness blocks; detector
  uncertainty fails closed at persistence boundaries.
- **S5 — bounded hostile input:** transcript discovery, parsing, redaction,
  rendering, and hooks have explicit byte/count/time bounds and durable
  quarantine behavior.
- **S6 — safe control-plane replay:** config, manifest, scheduler, and uninstall
  data are schema-bound; no stored argv is replayed as code and no destructive
  path escapes known roots.

An actor with arbitrary same-UID native code execution can normally read the
same user's files, change launch agents, and use the same OAuth credentials.
File modes, local MACs, and self-recorded hashes do not solve that general
problem. This audit instead requires that an untrusted agent never receive that
native capability. Same-UID integrity checks remain useful against accidental
drift and narrower write primitives, but must not be described as a stronger OS
security boundary.

## Verification corrections

### Refuted: `--tools` is not an inert/wrong flag

The first-pass sandbox report claimed Claude required `--allowedTools` and did
not recognize `--tools`. Direct verification against the installed Claude Code
2.1.210 binary refutes that claim:

- `--tools` restricts the **available built-in tool set**;
- `--allowedTools` controls which available tools may execute without a prompt,
  in addition to settings;
- `--strict-mcp-config` restricts MCP loading to the explicit config;
- `--setting-sources` selects user/project/local settings sources.

Therefore `--tools Read,Write,Edit,Glob,Grep` genuinely removes Bash,
WebFetch, and WebSearch from the dream model's selectable built-ins.

### Correction: the complete dream process is not yet proven hermetic

The corrected first synthesis went too far in calling the whole dream brain
"genuinely well-contained." The built-in tool and MCP surfaces are strongly
constrained, but `--setting-sources user` imports user-scope configuration,
including hooks/plugins. Hook execution is outside the model-selectable
built-in tool list and can have shell or network side effects. WP-017 validates
the vault diff and scratch integrity; it cannot detect arbitrary command
execution, network activity, hook side effects, or unrelated home-directory
writes.

"No network" must therefore mean **no model-selectable arbitrary egress tool**,
not a network-isolated process: Claude itself must reach Anthropic, and an
inherited hook may open its own connection unless hook loading is eliminated.

Consensus wording:

> The Claude dream brain's model-selectable built-in tool and MCP surface is
> strongly constrained. Full process isolation remains unproven until it uses a
> dedicated hook-free settings profile and passes live negative containment
> tests.

The original `02-dream-sandbox.md` F1 and bottom line are superseded; its other
evidence remains useful with the consensus status at the top of that report.

## Risk taxonomy

The reports originally used a single severity label for different concepts.
The consensus separates them:

- **Impact:** confidentiality, integrity, or availability consequence.
- **Prerequisite:** untrusted input only; hijacked agent; scoped write;
  same-UID write; same-UID native execution.
- **Reachability:** direct, chained, conditional, latent, or user-triggered
  replay.
- **Durability:** one run, one day, persistent memory, or unattended
  persistence.
- **Evidence:** source-confirmed, environment-dependent, or future/latent.
- **Priority:** P0 before any use; P1 before unattended/general use; P2
  defense-in-depth or future-milestone work.

## Consensus risk register

| ID | Consensus assessment | Prerequisite / reachability | Durability | Use gate |
|---|---|---|---|---|
| R1 | **HIGH, environment-dependent:** routine jobs have no Wienerdog-defined capability profile | malicious external content + a routine; shell/network execution depends on inherited user/project posture | unattended, repeatable | P0 |
| R2 | **HIGH integrity cluster, correlated:** mutable config, app, PATH, and manifest are replayed as trusted | scoped or same-UID write; manifest cases additionally require later uninstall | unattended persistence or user-triggered replay | P1, with P0 containment dependency |
| R3 | **HIGH confidentiality/integrity:** GWS grant protects the wrapper, not the credential | shell-capable agent or direct token access; chains directly with R1 | immediate external effect | P0; GWS disabled |
| R4 | **HIGH persistent integrity:** identity/digest gate trusts brain-authored authorization metadata | hijacked dream doing its normal vault-write job | persistent across future sessions | P0 |
| R5 | **HIGH impact, transient durability, medium reachability confidence:** daily Summary has a fail-open provenance gate | one crafted session plus non-canonical/missing or wrongly aggregated flag | nominally one day, but downstream agents may re-persist it | P0 |
| R6 | **HIGH confidentiality:** known/common secret forms bypass the only pre-brain scrubber | normal or hostile transcript containing a credential; persistence requires brain copy | git/history/digest persistence | P0 |
| R7 | **MEDIUM availability, cheap persistent trigger:** transcript reads are unbounded before caps | oversized attacker-influenced transcript | retries every night until intervention | P0 engineering priority |
| R8 | **MEDIUM destructive-safety cluster:** manifest replay can execute stored unload argv or delete unbounded paths | prior manifest write + user-triggered uninstall | delayed | P1 |
| R9 | **LATENT HIGH:** Codex dream path permits shell and broad reads | future M4 wiring; unreachable in v1 | autonomous | P2 before Codex activation |

R2, R3, and R8 share same-user/control-plane prerequisites and must not be added
as independent remote HIGH vulnerabilities. Their incremental impact is
authority laundering, persistence, and delayed trusted replay. R1 is the bridge
that can make the same-user condition reachable from untrusted external content
inside an unattended agent, which is why routine containment is first.

## Root-cause findings and agreed solution direction

### RC1 — Untrusted routines have ambient authority (R1)

`resolveCommand` launches a `skill:` job as bare `claude -p /<skill>`. Wienerdog
does not define its built-ins, allowed tools, settings sources, hooks, MCPs,
filesystem roots, or external-effect surface. Calling this guaranteed
"full-capability" was too categorical: actual headless execution depends on the
ambient configuration. Depending on ambient configuration is itself the defect.

**Agreed design:** no arbitrary `skill:<string>` dispatch. Each catalog routine
has a code-owned capability profile. Run it from a fresh staging directory with
a dedicated hook/plugin-free Claude settings profile, an explicit built-in tool
set, explicit permission allow/deny lists, a strict MCP config containing at
most the Wienerdog broker, no general Bash/WebFetch/WebSearch, and no direct
access to `~/.wienerdog`, harness settings, or credential files. Input is a
bounded snapshot; output is staged and validated before application.

Copying the dream's current no-Bash flags alone is not a usable fix because GWS
routines need controlled GWS operations. Those operations move behind RC2's
broker.

### RC2 — The GWS wrapper and raw OAuth credential have different authority (R3)

The audit is correct: `gmail.compose` can call `users.messages.send`, and the
stored full Calendar scope can mutate far more than read-only routines need.
Google's official documentation confirms that `gmail.compose` authorizes send;
there is no general Gmail API scope that permits arbitrary draft creation but
cryptographically forbids sending. Full `calendar` can edit/share/delete
calendars; `calendar.events` and read-only variants are narrower.

Moving grants into `secrets/`, adding a local MAC, or hashing config improves
tamper detection but does not stop the report's shell-capable same-user actor,
who can also read the OAuth token/key or rewrite the manifest.

**Agreed design:** a separate local GWS capability broker holds the credentials.
The routine sees only narrow, typed operations such as search/read,
create-draft, send-to-granted-recipient, calendar-list/show, and explicitly
granted event mutation. The broker derives routine identity from the launch,
not a model-controlled flag/environment value; parses recipients once; enforces
the grant and verb; and never exposes tokens or a generic HTTP/Google client.
Use separate least-scope credentials where possible: read-only credentials for
read paths and broker-only write-capable credentials. Rename/gate
`cal draft-event`, because it creates a live event and is not a draft.

GWS remains disabled until this architecture passes adversarial integration
tests. The product claim must be scoped honestly: a Wienerdog grant constrains
the broker/CLI path, not arbitrary native code already running as the user.

### RC3 — Durable identity authorization is self-asserted (R4/R5)

Re-deriving `source_sessions`, trust, and recurrence is necessary but not
sufficient: it proves that sessions exist, not that arbitrary brain-authored
body text semantically follows from them. A hijacked brain can cite three real
trusted sessions next to unrelated malicious instructions.

**Agreed safe default:** the dream cannot directly change the four injected
identity files. It may write non-injected proposals with the exact diff and
source evidence. An interactive TTY-only approval displays and approves exact
bytes; the orchestrator writes them and records the approved blob hash in a
brain-inaccessible state registry. The digest injects an identity file only
when its current hash matches that registry. Any one-byte later change fails
closed and alerts. `instructions.md` and goals remain human-approved; a future
weaker autonomous profile may be considered separately.

Until entry-level trusted provenance exists, remove the newest daily Summary
from the injected digest entirely. Fixing string parsing alone does not solve a
mixed-provenance aggregate.

### RC4 — Secret detection is treated as complete authorization (R6)

The concrete regex gaps are confirmed, but no provider-pattern list is
complete. Formats evolve; secrets may be encoded, split, wrapped, or unknown.
Running the same incomplete `redact()` again before commit does not close what
the first pass missed.

**Agreed design:** a shared detector returns sanitized text plus metadata-only
findings. Bound raw input before scanning. Combine structured assignment-key
recognition, current provider patterns, private-key blocks, contextual entropy,
and exact matching of Wienerdog-known token values. Scan at pre-brain,
brain-output/pre-commit, durable-log, and digest boundaries. At persistence
boundaries a hard finding reverts/quarantines the affected artifact and emits a
fixed, secret-free alert; it is not silently committed with altered prose. The
digest retains its last known-good version when a section fails. Sensitive
directories/files are explicitly 0700/0600, independent of umask.

Redaction remains defense-in-depth, not the external-effect boundary. RC1/RC2
prevent a detector miss from becoming live exfiltration.

### RC5 — Hostile input is bounded only after expensive parsing (R7)

**Agreed design:** pre-read stat limits, a streaming/line-bounded JSONL parser,
per-file and per-run budgets, bounded redaction input, and a fingerprinted
quarantine ledger. Oversized files produce a durable alert and cannot wedge
every future run. Do not blindly advance a global watermark: record the exact
skipped fingerprint so unrelated valid files remain processable and the file
can be explicitly retried later.

Digest output receives both line and byte limits with deterministic section
priority/truncation. All shipped hooks must implement actual fail-open behavior,
not merely comment it while `set -e` can exit non-zero.

### RC6 — Mutable control data is replayed as authority (R2/R8)

Hashes stored only in the same mutable manifest are drift detectors, not an
authenticity boundary against an arbitrary same-UID writer.

**Agreed design:** reject arbitrary skill names and mutable run-action changes;
resolve scheduled actions from a code-owned routine registry; use verified
absolute executable paths; validate vendored code against a trust anchor not
stored solely in the mutable tree; make the expected limits explicit. For
uninstall, validate the manifest schema, re-derive scheduler unload commands
from platform/entry identity, constrain every destructive path to known roots,
require ownership fingerprints, show every effect, and skip malformed or
unverifiable entries with an alert.

No file-only mechanism should claim to defeat arbitrary same-UID native code.
These controls protect against scoped writes, accidental drift, and confused-
deputy replay; RC1 prevents the autonomous model from gaining the broader
capability in the first place.

## Safe-to-use gates

Manual, local, GWS-disabled evaluation remains NO-GO until gates 1–8 (the P0
set) are satisfied on the final bytes. Unattended personal use additionally
requires gates 9–10 and the corresponding P1 work:

1. **Runtime containment gate:** a real headless run with a malicious fixture
   proves Bash, WebFetch/WebSearch, arbitrary MCP, user hooks/plugins, reads of
   secrets, and writes outside the staging/vault contract cannot occur. The
   test records the exact Claude version and argv.
2. **Routine gate:** arbitrary `skill:` dispatch is rejected; every shipped
   routine has a declared capability profile and adversarial test. Routines may
   remain entirely disabled while the base memory mode is evaluated.
3. **GWS gate:** no routine sees raw OAuth material or a generic client; direct
   send/calendar mutation, forged routine identity, forged grant, direct token
   read, and arbitrary recipient tests all fail. Until then Google setup is
   disabled, not merely documented as risky.
4. **Identity gate:** a hijacked brain, fabricated provenance numbers, three
   unrelated real sessions, wholesale overwrite, and post-approval one-byte
   tamper cannot alter the injected digest. Only exact human-approved bytes do.
5. **Daily gate:** no daily-note bytes enter the injected digest in the safe
   profile.
6. **Secret gate:** the known regression corpus is blocked at every persistence
   channel; a hit never appears raw in report/log/email/digest/git. Detector
   failure itself fails closed.
7. **Resource gate:** oversized file/line/backlog fixtures complete under a
   constrained heap and produce bounded quarantine records without starving
   valid sessions.
8. **Digest/hook gate:** line+byte caps hold; every hook returns zero on missing,
   malformed, racing, or oversized state.
9. **Safety gate:** manifest poison cannot execute arbitrary argv or delete a
   path outside known roots; scheduler/config/app tampering fails loud before
   the changed action executes.
10. **Full regression + threat-model gate:** normal behavior remains green and
    README/VISION/THREAT-MODEL claims match the actually enforced boundary.

After implementation, rerun this audit from a clean, pinned commit and record a
new go/no-go decision. Passing unit tests without the live adversarial gates is
not sufficient. P0 completion permits only the explicitly limited manual
evaluation profile; it does not silently authorize GWS, external-content
routines, or unattended scheduling.

## What is genuinely solid and should be preserved

- Claude dream built-in tool restriction and strict MCP exclusion are verified;
  extend rather than discard this design.
- No brain output is sourced/evaled/executed after the dream.
- Skill/ledger revision validators independently re-derive provenance and fail
  closed; this is the model for machine-checkable memory evidence.
- Vault diff validation, scratch integrity rollback, symlink/`..` escape
  handling, locking, one-commit revertibility, and atomic writes are strong.
- Install ownership fingerprints, prove-before-delete checks, sentinel
  neutralization, vault preservation, and TCC normalization are strong.
- OAuth PKCE/state/loopback handling and 0600 token writes are strong.
- CLI send allowlist, CRLF/Bcc rejection, draft fallback, and TTY confirmation
  are strong **inside their stated wrapper boundary**.
- Redaction is not a practical ReDoS surface; the issue is coverage and
  unbounded pre-scan input, not catastrophic regex backtracking.

## Research notes

- Google documents that `gmail.compose` permits `users.messages.send`:
  <https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send>
- Gmail scope descriptions explicitly describe `gmail.compose` as managing
  drafts **and sending**:
  <https://developers.google.com/workspace/gmail/api/auth/scopes>
- Calendar exposes narrower `calendar.events` and read-only scopes than full
  `calendar`:
  <https://developers.google.com/resources/api-libraries/documentation/calendar/v3/java/latest/com/google/api/services/calendar/CalendarScopes.html>
- Anthropic's CLI reference distinguishes `--allowedTools`; the installed
  2.1.210 help additionally verifies `--tools` as the available-built-in set:
  <https://docs.anthropic.com/en/docs/claude-code/cli-usage>

## Evidence map

- `01-memory-poisoning.md` — R4/R5 and the stronger skill/ledger precedent.
- `02-dream-sandbox.md` — corrected dream containment, inherited settings,
  latent Codex, lifecycle race.
- `03-secrets-redaction.md` — R6 and credential artifact permissions.
- `04-gws-grants.md` — R1/R3 and the GWS wrapper/credential distinction.
- `05-install-filesystem.md` — R8 and strong existing filesystem guards.
- `06-scheduler.md` — R1/R2, dispatch integrity, PATH, watchdog.
- `07-parsing-dos.md` — R5/R7, digest bounds, hook behavior.
- `ACTION-LIST.md` — implementable work packages and acceptance criteria.
