---
id: WP-catchup-per-job-authorization
title: Catch-up per-job authorization — bind an authorized per-job digest map into the catch-up OS registration; verify each due job before it runs
status: In-Review
model: opus
size: M
depends_on: [WP-156, WP-157]
adrs: [ADR-0004, ADR-0013, ADR-0028]
branch: wp/catchup-per-job-authorization
---

# WP-catchup-per-job-authorization: Catch-up per-job authorization (audit A7 — catch-up hardening)

## Context (read this, nothing else)

Wienerdog runs missed scheduled jobs via a **catch-up** entry (launchd
`RunAtLoad` / systemd `Persistent=true` / a Windows catch-up task) so a job the
machine slept through still runs within an hour of wake (M6). **IRON RULE
(ADR-0004): Wienerdog is just files** — no daemons; the launcher/catch-up runner
runs and exits with each fire.

WP-157 built the out-of-tree launcher and fire-time integrity for **normal**
per-job fires: each per-job OS entry carries `--expect-digest <d>` and the
launcher refuses if the re-derived descriptor digest ≠ that entry-bound value.
**Catch-up was left incomplete on purpose (WP-157 is an explicitly-incomplete
intermediate for this path).** Today the catch-up launcher path verifies only the
app-tree digest and then spawns `node bin/wienerdog.js run-job --catch-up`, whose
catch-up logic reads the jobs to run out of the **mutable** `config.yaml` and
calls `runJob` directly. So a `config.yaml` edit that a normal fire *refuses*
(digest mismatch) is *executed* by the next catch-up — a full bypass of A7's
fail-closed authorization (audit finding, WP-159 review HIGH).

The naive fix — read each job's `--expect-digest` back out of its per-job entry
**file** (LaunchAgents plist / systemd user unit / retained Windows XML) — is
**wrong**: those files are user-writable **source** artifacts, not the loaded
scheduler registration. An in-scope attacker edits `config.yaml` **and** the
per-job source file to carry the newly-derived digest **without reloading** the
scheduler; normal fires stay bound to the old *loaded* registration and refuse,
but catch-up reads the forged file and runs. (Reloading/re-registering requires
scheduler-registration capability = **outside A7's scope** = A12 — which is
exactly why the loaded/registered state is the only trustworthy anchor.)

**Honest boundary (state this; do not overclaim).** Same-user control of BOTH the
core and the OS scheduler can still replace both anchors (A12). A7 protects
**scoped core writes** and **detects drift**; this WP closes the catch-up bypass
for the scoped-write class only.

> **ADR note:** `ADR-0028` records the A7 architectural decision (owner-approved
> 2026-07-19), amended 2026-07-19 (fix-pass round 3): catch-up authorization is
> **PENDING until this WP** and is delivered here.

## Current state

- `src/scheduler/launcher.js` `verifyCatchup(p, expectDigest, env, platform)`
  (WP-157) verifies containment + app-tree digest against a single
  `--expect-digest`, then `main` spawns `node currentBin run-job --catch-up`. No
  per-job descriptor is consulted.
- `src/scheduler/generators.js` — **[R8:#2] catch-up registration exists on two
  platforms only:** macOS `catchupPlist` (via `ensureCatchup`, which is
  `if (process.platform !== 'darwin') return` — generators.js:501) and Windows
  `windowsCatchupTaskXml` (ONLOGON+hourly schtasks, via `schedule.js:151`
  `ensureCatchup`). **Linux has NO separate catch-up registration** — its per-job
  `.timer` uses `Persistent=true` (generators.js:254), so a missed fire replays
  the **normal per-job `.service`**, which already carries the normal per-job
  `--expect-digest` (WP-157). Per-job entries carry the per-job `--expect-digest`
  on all platforms.
- `src/scheduler/descriptor.js` (WP-156, incl. its fix-pass amendments):
  `buildDescriptor`, `deriveDescriptorDigest`, and the digest now cover
  `run`/`model`/`timeoutMs`/`vaultLayout`/`maxInputBytes`/outer-timeout/`schedule`
  (`at`+`timezone`)/`home`/exec pins/prompt hash/app release. The digest is the per-job
  authorization anchor.
- `src/cli/run-job.js` catch-up runner reads jobs from `config.yaml` and calls
  `runJob` directly (the bypass). **[R5]** its post-success path (L653) also calls
  `gen.ensureCatchup(paths, {loader})` (macOS), which regenerates the catch-up
  entry + digest map from the **current mutable** job set at **runtime** — a
  second, subtler bypass this WP must close (see the attended-authorization
  boundary below).
- `src/scheduler/launcher.js parseArgv` (WP-157) is schema-aware: `--catch-up`
  boolean; `--descriptor`/`--expect-digest` value-taking. This WP adds one more
  value-taking flag (`--job-digests`).

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/generators.js | At registration, bind the per-job digest map into the **catch-up entry's registered arguments** as `--job-digests <base64url(canonicalJSON)>` (one opaque token — [R4:#3]), populated under registration privilege (loaded/DB state), never re-read from an editable file per fire. **[R5]** provide the teardown **primitive** that removes the catch-up entry when no jobs remain (invoked only by `repointSchedules`, the teardown owner — [R8]). |
| modify | src/cli/schedule.js | Compute the per-job digest map (`{jobName: deriveDescriptorDigest(paths, job)}` over all configured jobs), base64url-encode the canonical JSON, pass it to the catch-up renderer (a mint caller — `schedule add`). **[R6]** `repointSchedules` also QUERIES the loaded catch-up registration and REPAIRS it (regenerate canonical entry + correct bound map) when missing/stale — the sole home for the missing-registration heal. **[R8]** teardown is stated ONE way: `repointSchedules` is the **sole teardown owner**; `schedule remove` must **invoke `repointSchedules`** for catch-up teardown, not tear it down directly. |
| modify | src/scheduler/launcher.js | `parseArgv` recognizes `--job-digests` (value-taking, opaque base64url token); `verifyCatchup` forwards it; `main` passes it through to the catch-up runner argv. The launcher NEVER reads a per-job entry file to obtain a digest. |
| modify | src/cli/run-job.js | The catch-up runner decodes `--job-digests` (bounded base64url→JSON→shape-validate; malformed/oversized ⇒ durable alert + zero spawn), authorizes the **union** of bound ∪ configured job names BEFORE due-filtering ([R4:#1]), and runs only jobs whose live `deriveDescriptorDigest` matches the bound map; additions/removals/mismatches ⇒ alert, zero spawn. **[R5] REMOVE the post-success runtime `gen.ensureCatchup` call (L653)** — a runtime path must not mint authorization from config; at most emit a read-only "catch-up entry missing" notice, never regenerate. |
| modify | src/cli/sync.js | **[R6/R9:#3]** the attended sync flow (its `repointSchedules` call) is the sole owner of catch-up **repair + teardown** (mint is done by all four attended callers — see the canonical invariant) — orchestrate the query+repair here; the map (re)bind + repair logic itself lives in `repointSchedules` (`schedule.js`, already listed). |
| modify | src/scheduler/status.js | **[R6]** `reloadMissing` is **excluded from the catch-up entry entirely** — it neither creates, authorizes, nor reloads it (catch-up repair/teardown is repointSchedules' sole responsibility). |
| modify | src/cli/init.js | **[R7]** `init`'s `ensureDreamSchedule` mints the catch-up map from freshly-validated descriptors (first-install; init does not necessarily run `sync`). No config-trusted/stale map. |
| modify | src/cli/adopt.js | **[R7]** `adopt`'s `ensureDreamSchedule` mints the catch-up map from freshly-validated descriptors — adopt does NOT call `sync`, so it is a first-class attended mint caller. **[R8:#3]** adopt runs no `createPins` today, so a legacy/pre-WP-154 install (config.yaml but no `exec-pins.json`) has no pins, and WP-154/156 require claude+git pins before binding a dream descriptor → adopt needs a **transactional pin preflight at the START of `adopt.run`** (dry resolve+verify claude+git → abort before any mutation on failure → atomic commit) — see **WP-154 A5 [R9:#2]**, which owns that step. The descriptor/map **mint** here (WP-catchup-per-job-authorization) runs only after WP-154's preflight has committed a complete pin store. `src/cli/adopt.js` is in both WPs' Deliverables (preflight under WP-154, mint under WP-catchup-per-job-authorization; serialized). |
| create | tests/unit/catchup-authorization.test.js | The negatives below. |
| modify | tests/unit/scheduler-generators.test.js | Assert the catch-up entry carries `--job-digests` with a canonical map. |

### Exact contracts

**Canonical per-job digest map** (bound into the catch-up entry argv at
registration): a canonical-JSON object `{ "<jobName>": "sha256:…", … }` over
**every configured job**, each value = `deriveDescriptorDigest(paths, job)` (the
same digest the per-job entry binds). Canonical = key-sorted, no whitespace
variance — deterministic. Small (one entry per job).

**[R4:#3] Transport — base64url, not raw JSON.** Quote-bearing canonical JSON as
a single argv value does NOT survive `CommandLineToArgvW` token boundaries in the
Windows Task Scheduler `<Arguments>` (JSON quotes are consumed as command syntax)
and has the same quoting hazard under systemd `ExecStart` — the runner would get
invalid JSON and every catch-up would fail closed with no diagnostic. **Exact
transport:** the bound argv value is **`base64url(canonicalJSON)`** (one opaque
token, no shell/XML metacharacters). The run-job side decodes with a **strict,
bounded schema decoder**: reject if length > a fixed cap (e.g. 64 KiB); `atob`
(base64url) → `JSON.parse` → shape-validate (object of `string → "sha256:<hex>"`);
**any** malformed/oversized/shape-invalid input ⇒ **durable alert + zero spawn**,
never a thrown crash. Do not use raw JSON or per-platform ad-hoc escaping.

**[R8:#2] Platform contract — the map applies to macOS + Windows only.** The
base64url per-job digest map is bound into the **macOS `catchupPlist`** and the
**Windows schtasks ONLOGON+hourly** catch-up entries — the two platforms with a
*separate* catch-up registration + a shared `run-job --catch-up` dispatch.
**Linux has no separate catch-up entry and no map:** its per-job systemd
`.timer Persistent=true` replays the **normal per-job `.service`**, already
authorized by that job's normal per-job `--expect-digest` (WP-157) — so Linux
catch-up needs no all-job map and must **not** introduce a duplicate all-job
dispatch. All WP-catchup-per-job-authorization map machinery (bind, decode, union-authorize) is
macOS/Windows only.

**Anchor rule (the whole point).** The authorized digest for a job on the
catch-up path is read **only** from:
1. the `--job-digests` map delivered via the launcher's argv (which the OS passes
   from the **loaded/registered** catch-up entry), OR
2. (implementer's choice, recorded) a **live-registration query** —
   `launchctl print gui/<uid>/<label>` / `systemctl --user show` /
   `schtasks /query /xml` — which reads the loaded state / task DB.

It is **never** read from the per-job entry **file** on disk, nor from
`config.yaml`. A forged per-job source file (edited without reload) must not
affect the decision.

**[R5/R7] Attended-authorization boundary — only attended, user-invoked
registration may mint the map.** The authorized-mint set is `sync`/
`repointSchedules`, `schedule add`, `init`'s `ensureDreamSchedule`, and `adopt`'s
`ensureDreamSchedule` (see the table below), each minting from freshly-validated
descriptors. The union-before-due algorithm cannot protect an anchor that a trusted
**runtime** path refreshes from mutable config. Confirmed hole: the post-success
runtime backstop `gen.ensureCatchup(paths, {loader})` (run-job.js:653, macOS)
regenerates the catch-up entry **and its digest map from the current (mutable)
job set** after a nightly job succeeds. Attack: statically add/modify job B in
`config.yaml` without touching authorized job A; A's normal fire still passes its
own per-job digest; after A succeeds, the runtime backstop **binds B's digest
into LOADED scheduler state** — the next catch-up treats B as authorized and runs
it, no alert, with **no scheduler-registration capability** ever exercised by the
attacker.

**Invariant (enforce at every path below):** only **attended, user-invoked
registration** may **mint or replace** the catch-up authorization map /
registration, and it must always mint from **freshly-validated descriptors derived
in that same attended run** — never from a retained source file or a stale map.
**No nightly/runtime path may derive authorization from `config.yaml`.**

Enumerated catch-up registration/reload paths + the required stance:

| Path | When | Stance | Required behavior |
|------|------|--------|-------------------|
| `run-job.js:653` `ensureCatchup` (post-success backstop) | **runtime/nightly** | forbidden to mint | **Remove** the re-registration. It may, at most, read-only *check* presence and emit a notice ("catch-up entry missing — run `wienerdog sync`"); it must **never** regenerate the entry/map from config. If it cannot supply the already-loaded map it must **leave the loaded entry intact** (never overwrite with stale/missing args → would disable catch-up). |
| `schedule.js:258` `ensureCatchup` (via `schedule add`) | attended, user-invoked | **mints** | Computes + binds the canonical map from freshly-validated descriptors. |
| `init.js:186` `ensureDreamSchedule` → `registerPlatform` → `ensureCatchup` | attended, user-invoked (`init`) | **mints** | **[R7]** First-install mint from freshly-derived descriptors (init does not necessarily run `sync`). |
| `adopt.js:370` `ensureDreamSchedule` → `registerPlatform` → `ensureCatchup` | attended, user-invoked (`adopt`) | **mints** | **[R7]** Adopt mints directly — it does **not** call `sync` — so it is a first-class mint caller, from freshly-derived descriptors, never a retained/stale map. |
| `sync.js:188` `repointSchedules` | attended (`sync`) | **mints AND repairs** the catch-up registration + map | **[R6] Sole REPAIR/teardown owner.** Recomputes + rebinds the map from freshly-validated descriptors, AND **queries the loaded catch-up registration and repairs it** when missing/stale — regenerating the canonical entry with the correct bound base64url map (and owning the final-job **teardown**). The sole home for the missing-loaded-registration case, so a byte-identical source can still be restored with a fresh authorized map. |
| `sync.js:197` / `status.js:185` `reloadMissing` (generic sync-time heal) | attended (runs under `sync`) | **never touches the catch-up entry** | **[R6]** The generic heal re-registers missing CANONICAL per-job entries (WP-145) but is **excluded** from the catch-up entry entirely. Catch-up **repair/teardown** belongs to `repointSchedules`; **mint** belongs to any attended registration caller above. |
| `doctor` | attended, read-only | **never mints/touches** | Read-only presence report only. |

**CANONICAL OWNERSHIP INVARIANT [R7/R9:#3] (stated verbatim in WP-catchup-per-job-authorization, ADR-0028
item 6, and FIX-PLAN C8):** *All four attended, user-invoked callers —
`sync`/`repointSchedules`, `schedule add`, `init`, `adopt` — may MINT/register the
catch-up map from freshly-validated descriptors; `repointSchedules` ALONE owns
repair + teardown; `schedule remove` delegates teardown to `repointSchedules`.*
`reloadMissing` and `doctor` never mint or touch the catch-up entry.

**Legitimate schedule change** refreshes the map via **any** of the four attended
mint callers above (not `sync` alone) — including the edge case of **removing the
final job**, whose teardown is owned by `repointSchedules`: the map/entry must be
**cleanly torn down** (catch-up entry + map removed, not left stale).

**[R4:#1] Authorize the FULL job set BEFORE computing due-ness.** The naive
"filter due jobs from mutable `job.at`, then digest-compare each due job" lets an
attacker rewrite an overdue job's `at` to a future time (→ not-due → never
authorized → **silently suppressed, no alert**), and job *removal* has the same
gap (only live-configured jobs are traversed). Due-filtering reads the very
`job.at` the digest is supposed to authorize, so it must run **after**
authorization, not before. **Corrected algorithm** (`run-job.js`):
```
liveJobs   = configured jobs (validated config)        // name → job
boundNames = keys(map)                                  // from the loaded argv map
names      = union(boundNames, keys(liveJobs))          // authorize the UNION
for name in names:
  authorized = map[name]
  live       = liveJobs[name] ? deriveDescriptorDigest(paths, liveJobs[name]) : undefined
  if (authorized === undefined)  → ADD  : alert "unauthorized job <name>", zero spawn
  else if (live === undefined)   → REMOVAL: alert "authorized job <name> removed from config", zero spawn
  else if (live !== authorized)  → DRIFT : alert "<name> descriptor changed", zero spawn
  // (any of the three ⇒ this job is NOT eligible to run)
# ONLY jobs that passed authorization are eligible:
for name in authorizedJobs:
  if isDue(liveJobs[name]) → runJob(liveJobs[name])     // due computed from the AUTHORIZED schedule
```
Because `job.at`/`schedule` is in the descriptor digest (WP-156 A6), an `at`
rewrite makes `live !== authorized` ⇒ **DRIFT alert** (not silent suppression),
and a removed job ⇒ **REMOVAL alert**. Due-ness is computed only from a schedule
that has already been authorized. A single unauthorized/removed/drifted job
alerts + spawns nothing for that job; it does not abort authorization of the
others.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only.
- **Loaded-state, not source-file, is the anchor** — the single load-bearing
  invariant. If you find yourself reading a `.plist`/`.service`/`.xml` file to
  get a digest, STOP: that is the vulnerability this WP exists to close.
- **Verify-to-use residual (inherited, A12).** As with the launcher's normal
  path, the catch-up runner spawns `node` against the on-disk app tree after
  verification — the reopen race is the documented A12 residual (ADR-0028), not
  closed here.
- macOS/Windows catch-up negatives are required (the platforms where catch-up is
  most exercised).
- When uncertain, choose the simpler option and record it under "Decisions made".

## Security checklist

- [ ] The authorized per-job digest on the catch-up path comes ONLY from the
      loaded/registered catch-up entry (argv map or live-registration query),
      never from a per-job entry file or `config.yaml`.
- [ ] A `config.yaml` `run`/`model`/`at`/… rewrite ⇒ the catch-up runner refuses
      that job (alert, zero spawn), matching the normal-fire refusal.
- [ ] Editing a per-job entry **source file** (without reloading the scheduler)
      does NOT let catch-up run a drifted job.
- [ ] Authorization runs over the **union** of bound ∪ configured job names and
      **precedes** due-filtering; an `at`-rewrite-to-future or a job removal
      **alerts** (never silently suppresses).
- [ ] The `--job-digests` transport is base64url; a malformed/oversized value
      fails closed with a durable alert, never an unhandled parse crash.
- [ ] **[R5/R7]** Only attended, user-invoked registration callers (`sync`/
      `repointSchedules`, `schedule add`, `init`, `adopt`) mint/replace the
      catch-up map, always from freshly-validated descriptors; NO nightly/runtime
      path (esp. the run-job post-success backstop) re-derives authorization from
      `config.yaml`. `repointSchedules` is the sole teardown owner (`schedule
      remove` delegates teardown to it). Removing the final
      job via attended `sync` tears the entry + map down cleanly.

## Acceptance criteria

- [ ] **[bypass closed]** With the catch-up map bound, rewriting `config.yaml`
      `run` for the dream job ⇒ the catch-up runner refuses it (zero recorded
      spawn, durable alert).
- [ ] **[file-forge]** Rewriting `config.yaml` `run` AND the per-job source entry
      file to carry the newly-derived digest, WITHOUT reloading the scheduler ⇒
      still refused (the loaded map is the anchor).
- [ ] **[due-time, R4:#1]** An `at`-only rewrite of an authorized job ⇒ a **DRIFT
      alert** + zero spawn (authorized BEFORE due-filtering, so it is never
      silently suppressed by being made not-due).
- [ ] **[removal, R4:#1]** Removing an authorized job from `config.yaml` ⇒ a
      **REMOVAL alert** + zero spawn (not silent). An added/unauthorized job ⇒ an
      alert, zero spawn.
- [ ] **[transport, R4:#3 / R8:#2]** End-to-end on **macOS + Windows** (the map
      platforms): the argv value Node actually receives decodes (base64url → JSON →
      shape-valid) to the bound map; a **malformed** or **oversized** map ⇒ durable
      alert + zero spawn (no crash). **On Linux there is no map** — assert the
      per-job `.timer Persistent=true` replays the NORMAL per-job `.service`
      (authorized by its own `--expect-digest`), with **no** separate all-job
      catch-up dispatch.
- [ ] **[runtime-mint, R5]** Statically add/modify job B in `config.yaml`, then
      let unchanged authorized job A succeed on its normal fire ⇒ A's success does
      **NOT** reload the catch-up entry and does **NOT** authorize B; a subsequent
      catch-up **refuses B** (alert + zero spawn). Removing a job via attended
      `sync` cleanly refreshes the map (including removing the **final** job:
      entry + map torn down, not left stale).
- [ ] **[init/adopt mint, R7]** `init` and `adopt` (neither necessarily running
      `sync`) each bind the catch-up map from **freshly-validated descriptors**
      derived in that run (assert the loaded entry's argv carries the correct
      base64url map; assert it is NOT sourced from a retained file or a stale map).
- [ ] **[adopt pin-bootstrap, R8:#3]** A valid pre-WP-154 install (config.yaml,
      **no** `exec-pins.json`) → `adopt` **creates pins** (clean-PATH `createPins`)
      then binds a valid descriptor + catch-up map; if pins can't be created
      (e.g. claude/git unresolvable) it **aborts before mutating adoption state**
      (fail-closed, never half-adopt) — never binds a partial/pinless descriptor.
- [ ] **[missing-registration heal, R6]** With the source file + manifest intact
      and canonical but the **loaded** OS catch-up registration missing, ONE
      attended `wienerdog sync` restores it with the correct bound map (assert the
      loaded entry's argv carries the right base64url map). AND the generic
      `reloadMissing` heal, run alone, **never** creates/authorizes/reloads the
      catch-up entry (assert the exclusion). Mutation: if repoint doesn't repair
      catch-up ⇒ the restore assertion fails; if `reloadMissing` still touches
      catch-up ⇒ the exclusion assertion fails.
- [ ] macOS and Windows catch-up negatives execute (not just POSIX).
- [ ] `npm test` and `npm run lint` are green.

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern "catchup-authorization|scheduler-generators"
npm test
npm run lint
```

## Out of scope (do NOT do these)

- The normal per-job fire path — **WP-157** (this WP mirrors its anchor for
  catch-up).
- The descriptor fields / digest content — **WP-156** (this WP consumes
  `deriveDescriptorDigest`).
- The verify-to-use reopen race — documented A12 residual (ADR-0028).

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/catchup-per-job-authorization`; conventional commits; PR titled
   `feat(security): catch-up per-job authorization via loaded registration (WP-catchup-per-job-authorization)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per the WORKING-NOTES; `branch:`/PR
> fields are kept for template/upstream-porting fidelity.
