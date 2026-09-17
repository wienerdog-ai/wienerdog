---
id: WP-dev-descriptor-no-tree-hash
title: Stop content-addressing the live checkout in the dev job descriptor
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0028, ADR-0031, ADR-0042]
epic: audit-a7
---

# WP-dev-descriptor-no-tree-hash: the dev descriptor stops hashing a live tree

> **Record, 2026-09-17 (post-merge) — no defect in what shipped.**
>
> Implemented in PR #252 (merge `e545033c`, 2026-09-17), tip `c6f46df5`. Both
> PR gates on that tip: wd-reviewer APPROVE (every check executed, including
> the enabled a7-integrity dev-fire scenarios and an independent replay of
> mutation 1 that reddened AC1, AC3 and AC4); Codex plugin `review` on
> `gpt-6-astra` clean, no findings (it disclosed that filesystem-writing tests
> could not run in its read-only sandbox). CI seven checks pass. Suite 2758 /
> 2746 / 0 / 12; lint passed; red-proofs RUN: PROVEN, 69 declared.
>
> **Recorded, not errata:** (i) `tests/unit/descriptor.test.js:332`
> re-requires `node:fs` though the file already holds the same module object
> — harmless; (ii) the implementer found and fixed a bug in its own AC3 test
> during hand-verification: on macOS `/var` symlinks to `/private/var`, so an
> un-realpath'd checkout path never matched the realpath'd read paths; (iii)
> each RED declaration carries a `testNamePattern` because mutation 1 also
> reddens AC3 and AC4 — confirmed faithful by the reviewer's independent
> replay.

<!-- errata above; the spec as it shipped follows -->

- Authoring rules live in `docs/runbooks/spec-authoring.md` — the
  template gives the skeleton, the runbook the rules. Read both.

> **READ THIS BEFORE ANYTHING ELSE — the base this spec was verified against.**
> Every `file:line` citation, every quoted code shape and every recorded command
> output below was **executed** against `origin/main` at **`545df8bd`**
> (2026-09-17) and **re-confirmed unchanged** at **`2d5e2465`**, the base this
> revision rebased onto — the delta between them is documentation only (`git diff
> --name-only 545df8bd 2d5e2465` returns nothing outside `docs/`), and the eleven
> load-bearing cites in `src/scheduler/descriptor.js`, `src/scheduler/launcher.js`,
> `docs/GLOSSARY.md`, `docs/adr/0028-…` and the three test files were re-read at
> `2d5e2465` and all resolve.
>
> **`Ready` is not the same as "still true".** `src/scheduler/descriptor.js` moved
> under the previous revision of this spec and invalidated nearly every cite in
> it (see `docs/specs/logbook/2026-09-17-dev-descriptor-no-tree-hash-round-zero.md`
> §2 for the full before/after table). **The orchestrator session re-runs this
> spec's executable Current-state claims against current `main` immediately before
> writing the dispatch message, and names each claim and its result in that
> message** (`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"). A
> stale claim blocks the dispatch and routes this spec back to wd-architect; the
> implementer is never dispatched to work around one. The cheapest single probe is
> **V5**: `grep -n 'appTreeDigest(paths)' src/scheduler/descriptor.js` must print
> **three** lines — `72`, `222`, `223` — before any work starts. If it prints two,
> the change already landed; if the line numbers moved, the file moved.

## Context (read this, nothing else)

Wienerdog schedules jobs (the nightly `dream`, later routines) with the OS-native
scheduler. The registered OS entry never invokes the app directly: it invokes the
**independent launcher** at `<core>/launcher/launch.js` — a file that lives
OUTSIDE the mutable app tree — which verifies integrity and only then spawns
`node <app>/bin/wienerdog.js run-job <name>`. Any verification failure is a
durable alert plus **zero** spawn (ADR-0028). **IRON RULE (ADR-0004): Wienerdog
is just files.** The launcher runs and exits with each fire; nothing here starts
a process that outlives its job, and this WP adds no daemon, watcher, or poller.

An install has one of two **stances**, and since `WP-stance-authority-containment`
landed (`86d069e0`, 2026-07-26) the stance is decided by **containment alone**: an
install is **dev** only when `<core>/app/current` realpath-resolves *outside*
`<core>/app`; every other case — including a `.git` planted inside the app tree,
`WIENERDOG_DEV=1`, or an unresolvable path — is **prod** (`src/core/vendor.js:281-292`
`installStance`; `docs/GLOSSARY.md:31`). In **prod** the published files are copied
into `<core>/app/<version>/` and `app/current` symlinks there; that tree is
immutable between updates, so the launcher can demand a byte-exact **app release
digest** (a sha256 content address over the sorted per-file hashes). In **dev**
`app/current` points at a live git checkout — the shape a plain `git clone` install
produces, which `docs/GLOSSARY.md:31` records as staying dev. A dev tree is edited
constantly by definition, so ADR-0028 amendment #7 (2026-07-19) ruled that a dev
install binds a **reduced** descriptor digest — `appRelease` collapses to
`{stance:'dev', root}`, excluding `treeDigest` and `version`, while every other
field (run, model, timeouts, vaultLayout, vaultRoot, home, schedule, node, exec
pins) stays digest-covered. So on dev, a tracked-source edit stays runnable but a
`config.yaml`/schedule/home edit still drifts and refuses.

**`buildDescriptor` nevertheless computes an app release digest for the dev
`appRelease` and then throws it away**: `reduceForDigest` rebuilds
`{stance, root}` from scratch before digesting, so the field it computed is never
digested and no dev code path ever reads it. Hashing a **live** checkout is not
free and not safe: a concurrent `git`/`npm` write can unlink a file mid-walk, the
resulting `ENOENT` propagates out of `buildDescriptor`, and the nightly **dream**
**refuses**. This WP deletes that computation. It changes **nothing** on prod, and
— by `reduceForDigest`'s own construction — it cannot change any dev digest, so
nothing already registered needs re-minting.

**This WP implements an already-ratified contract; it does not decide one.**
ADR-0028's amendment of 2026-07-25 is `Status: **Accepted. OWNER-SIGNED
2026-07-26.**` (`docs/adr/0028-scheduler-app-executable-integrity.md:752`), and its
§1 states the corrected contract verbatim (`:791-797`): *"The dev `appRelease`
records `{version, stance, root}` and computes **no** `treeDigest`. The prod
`appRelease` is unchanged (`{version, treeDigest, stance}`) … no dev per-job entry
needs re-minting, and no user action is required."* Table A below is that
sentence, made into this WP's canonical table.

**Catch-up is not in scope and its behaviour does not change.** Catch-up (running
jobs missed while the machine was off) has a separate OS registration whose
launcher gate is containment inside `<core>/app` plus a byte-exact app release
digest (`src/scheduler/launcher.js:389-393`). A dev install fails containment
unconditionally, so catch-up refuses on every dev install. That is WP-157's
ratified disposition and ADR-0028's amendment §2 (`:799`) reaffirms it; it
**stands**. A round-2 draft of this WP proposed a dev catch-up branch; it was
**rejected by the owner** — recorded in that same owner-signed amendment (see
"Out of scope → dev catch-up", which you must read before proposing anything
adjacent).

## Current state

Everything below was re-derived against `origin/main` at **`545df8bd`**; line
numbers are that commit's. The previous revision of this spec cited `efd1489`;
`src/scheduler/descriptor.js` and `src/scheduler/launcher.js` have both moved
since, so **every** cite below is a fresh reading, not a carried-forward one.

### 1. The block this WP edits — `src/scheduler/descriptor.js:217-223`

```js
    appRelease:
      stance === 'dev'
        ? // Dev checkouts are live-edited: the digest reduces appRelease to
          // {stance, root} (excludes treeDigest+version) so a tracked-source edit
          // stays runnable; every OTHER field is retained + digest-covered.
          { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'dev', root: appRoot }
        : { version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'prod' },
```

`stance` is set at `descriptor.js:191` from `installStance(paths)`
(`src/core/vendor.js:281-292`: realpath containment of `app/current` inside
`<core>/app`, failing closed to `'prod'` when either path is unresolvable).
`appRoot` is `fs.realpathSync(currentLink(paths))` (`descriptor.js:181`).
**This WP touches neither** — see Out of scope.

### 2. Why removal is provably migration-free — `descriptor.js:254-259`

```js
function reduceForDigest(d) {
  if (d && d.appRelease && d.appRelease.stance === 'dev') {
    return { ...d, appRelease: { stance: 'dev', root: d.appRelease.root } };
  }
  return d;
}
```

It builds `{stance, root}` **from scratch**, so whether the input `appRelease`
carries a `treeDigest` cannot affect the resulting digest. `descriptorDigest(d)`
(`descriptor.js:261-264`) is `'sha256:' + sha256(canonicalize(reduceForDigest(d)))`.
That fact is the whole migration argument, and AC2 is its executable form.
Executed on unmodified `main` at `545df8bd`, over a dev fixture:
`descriptorDigest(d) === descriptorDigest({...d, appRelease:{...d.appRelease,
treeDigest:'sha256:'+'0'.repeat(64)}})` printed `true`.

### 3. The app-tree content address — unchanged by this WP

`descriptor.js:48-63` `appTreeDigestOf(root)` walks the whole tree and hashes
every regular file, with **no exclusion list of any kind** (no `.git`, no
`node_modules`, no dotfile filter); only symlinks and non-regular files are
skipped. `descriptor.js:72` `appTreeDigest(paths)` is the thin wrapper the
`appRelease` arms call. `src/scheduler/launcher.js:130-144` holds a **second,
independent copy** of `appTreeDigestOf`, because the launcher's only top-level
requires are Node builtins (`launcher.js:41-44`) — it cannot require the hash
from the tree it is about to verify (`launcher.js:22-31` states that design
point).

**The invariant binding the two copies is digest equality, not textual
identity.** Be precise here, because the existing test title says "byte-for-byte"
and that title is misleading — do not inherit its wording. The two bodies are
**not** textually identical today: `descriptor.js` carries two inline comments
(`// POSIX separators, always` on the `childRel` line at `:54`, and
`// symlinks / specials excluded — content, not link topology, is addressed` at
`:57`) that the `launcher.js` copy does not have. What is enforced is that both
functions return the **same digest for the same tree**:

- `tests/unit/launcher.test.js:274` — `launcher.appTreeDigestOf(target) === descriptorMod.appTreeDigest(paths)` over a prod fixture.
- `tests/unit/launcher.test.js:287` — `launcher.appTreeDigestOf(root) === descriptorMod.appTreeDigestOf(root)` over hostile filenames (unicode, embedded `"` and `\n`, a nested `sub/dir/deep.json`).

A comment-only edit to either copy therefore does **not** turn those tests red,
and it should not — it changes no digest. A *semantic* edit does. **This WP
modifies neither copy**, and `tests/unit/launcher.test.js` is not a deliverable,
so both tests must still pass **unmodified**. V6 is the executable proof.

### 4. What reads the dev `appRelease.treeDigest` — nothing

`grep -rn treeDigest src bin tests` at `545df8bd` shows the only readers are
`launcher.js:334` (the **prod** branch of `verifyAndResolve`, which compares the
live tree hash from `:333` to `descriptor.appRelease.treeDigest`) and two test
assertions, `tests/unit/descriptor.test.js:234` and
`tests/unit/scheduler-schedule.test.js:1410` — both on **prod** fixtures
(`descriptor.test.js:235` asserts `stance === 'prod'`; `scheduler-schedule.test.js`
uses a contained app tree). No dev code path reads it: the dev branch of
`verifyAndResolve` (`launcher.js:301-323`) checks live stance, bound-root identity
and the re-derived digest, and never touches `appRelease.treeDigest`. The catch-up
gate (`launcher.js:391`) compares against the entry-bound `--expect-digest`, not
against this field.

### 5. The defect this removes — a mid-walk `ENOENT` becomes a refusal

Every dev descriptor derivation walks and hashes the whole live checkout, then
discards the result. Two consequences, both measured on `545df8bd`:

- **It makes `writeDescriptor` non-idempotent on dev.** `descriptor.js:277`
  documents *"unchanged inputs ⇒ byte-identical file"* (`writeDescriptor` itself
  is at `:285`); on dev the recorded `treeDigest` changes whenever any file under
  the checkout changes, so the file is rewritten on inputs that are unchanged in
  every respect the digest covers. **Executed** against a dev fixture on
  unmodified `main`: after appending one byte to the checkout's
  `bin/wienerdog.js`, `writeDescriptor` returned `changed:true` while
  `digest` was **unchanged** — a rewrite that the authorization record itself
  says is a no-op. With D1 applied the same run returned `changed:false`.
- **It turns a concurrent write into a refusal.** `appTreeDigestOf` stats a
  directory entry (`descriptor.js:52`) and then reads it (`:56`); a
  `git`/`npm`/editor write that unlinks the file in between raises `ENOENT`
  inside the walk. Nothing catches it in `buildDescriptor`, so it propagates: on
  the nightly per-job fire it reaches `verifyAndResolve`'s outer catch
  (`launcher.js:352-355`) and the dream refuses with `integrity check errored: …`;
  inside `catchUp` the per-job catch (`src/cli/run-job.js:1377-1382`) converts
  *any* `deriveDescriptorDigest` throw into the misleading *"it is authorized but
  no longer in your config"* (`run-job.js:1386`). This is the defect that bites,
  and it is the reason this WP exists — the I/O cost below is secondary.

### 6. Cost of hashing a live checkout — provenance, do not re-measure

ADR-0028's owner-signed 2026-07-25 amendment §1 records the measurement
(`docs/adr/0028-scheduler-app-executable-integrity.md:779-789`): **8,922** regular
files on the maintainer's install at `efd1489` — 3,341 under `.git/`, 4,905 under
`node_modules/`, 676 of product source and docs, i.e. **92.4%** of the work on
files that are not product code, at **0.35–0.57 s** per warm pass, once per job on
every dev derivation. Quote those figures from the ADR if you need them; a live
checkout drifts by the hour, so a re-measurement legitimately differs and leaves
two numbers in the repo. That drift **is** the defect, not a measurement flaw.

### 7. The maintainer's own install is **prod** today — the motivation is not "it bites them nightly"

Measured 2026-09-17 on this machine: `~/.wienerdog/app/current ->
/Users/gyulafeher/.wienerdog/app/0.13.0`, i.e. *contained* inside `<core>/app`,
which `installStance` (`vendor.js:281-292`) classifies **prod**. A previous
revision of this spec asserted the opposite (a dev install pointing at the
Claude_Projects checkout) and used it to argue that the defect fires on the
maintainer's nightly dream. **That is no longer true and the claim is withdrawn.**
What remains true, and is the whole justification: the defect is live on **any**
dev-stance install — the shape a plain `git clone` install produces
(`docs/GLOSSARY.md:31`) — and the corrected contract is already owner-signed
(Context, ADR-0028 §1). Do not restate the withdrawn claim anywhere.

### 8. `docs/GLOSSARY.md:26` is falsified by this WP

The **job descriptor** entry ends its field list with `` the app release digest
(`appRelease`: `version`, `treeDigest`, `stance`) ``. That was already imprecise
on dev (it omits `root`, which the dev descriptor has recorded since ADR-0028
amendment #7) and Table A makes it flatly wrong. The same entry's separate
"**Dev reduction:**" sentence describes what the *digest* covers and stays true.

### 9. The dev fixture idiom in `tests/unit/descriptor.test.js` changed under you

`WP-stance-authority-containment` replaced the old "plant a `.git` inside
`<core>/app`" dev fixture — that now mints **prod**
(`tests/unit/descriptor.test.js:285-297` asserts exactly that). The current dev
fixture is `setupDevOutside()` at `tests/unit/descriptor.test.js:58-70`, which
repoints `app/current` at a checkout outside `<core>/app`. Its first consumer is
`descriptor.test.js:164-177`. Use `setupDevOutside()`; do **not** invent a second
dev fixture and do **not** modify either existing test.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing, per scripts/boundary-check.js: this spec file
     itself, package-lock.json, memory/lessons/inbox.md, and docs/specs/logbook/. -->

**Sizing (recorded, not left implicit).** One production edit of one ternary arm
plus its comment, two new tests, one RED declaration file, and one glossary
parenthetical. **S** — well under a session. It is not split further.
`depends_on` is empty **by argument, not by default**: the one WP that also edits
`src/scheduler/descriptor.js` is `WP-stance-authority-containment`, and it is
**Done** (see Implementation notes → "Relationship to the two WPs that share this
file").

| Action | Path | Notes |
|--------|------|-------|
| modify | src/scheduler/descriptor.js | **D1** — the dev `appRelease` arm drops `treeDigest` (Table A) and its comment is updated. No other change: `appTreeDigestOf`, `appTreeDigest`, the prod arm, `stance` derivation (`:191`), `profileAndPromptHash`, `canonicalize`, `reduceForDigest` and `descriptorDigest` are untouched. |
| modify | tests/unit/descriptor.test.js | **T1**, **T2** (Test index). The existing prod assertions at `:233-235` and the dev-fixture test at `:164-177` must stay **unmodified**; reuse `setupDevOutside()` (`:58-70`). |
| create | tests/red-proofs/dev-descriptor-no-tree-hash.proofs.json | **D4** — this WP's three RED declarations (ids and `criterion` values fixed under "Exact contracts"; `suite` is `tests/unit/descriptor.test.js`). ADR-0042 lane. |
| modify | docs/GLOSSARY.md | **D2** — one parenthetical in the **job descriptor** entry (`:26`), exact wording in Implementation notes. No other entry, no other line. |

Not deliverables, deliberately: `src/scheduler/launcher.js`, `src/cli/schedule.js`,
`src/cli/run-job.js`, `src/core/vendor.js`, `tests/unit/launcher.test.js`,
`tests/unit/scheduler-schedule.test.js`, `tests/scenarios/a7-integrity/**`,
`docs/THREAT-MODEL.md`, `docs/runbooks/scheduler-and-executable-integrity.md`,
`docs/adr/0028-scheduler-app-executable-integrity.md`. See Out of scope for why
each is untouched. Several of them contain tests that must pass **unmodified** —
that is this WP's proof that nothing else moved.

### Exact contracts

`buildDescriptor(paths, job, opts)` keeps its signature and every other field.
Only the `appRelease` value changes, and only on dev (Table A):

```jsonc
// dev, BEFORE (545df8bd main)
"appRelease": { "version": "0.0.1", "treeDigest": "sha256:…", "stance": "dev", "root": "/…/checkout" }
// dev, AFTER
"appRelease": { "version": "0.0.1", "stance": "dev", "root": "/…/checkout" }
// prod, BEFORE and AFTER — byte-identical
"appRelease": { "version": "0.0.1", "treeDigest": "sha256:…", "stance": "prod" }
```

`descriptorDigest(d)` returns the **same string** for a dev descriptor before and
after, because `reduceForDigest` discards `appRelease` and rebuilds
`{stance, root}` (Current state §2). No re-minting, no migration, no
compatibility shim.

#### The literal file this code generates, in full

`writeDescriptor` writes `<core>/state/descriptors/<job>.json`, mode `0600`, as
`canonicalize(d) + "\n"` — one line, keys sorted recursively, no indentation
(`descriptor.js:289`). Below is the **complete** file produced with D1 applied,
captured from an executed run against a `setupDevOutside`-shaped fixture
(`node:fs` temp root; the `dream` job at `03:30`, `timeoutMinutes: 20`, no
`dream_model`, the two-pin `claude`+`git` store the test fixture writes). The only
fixture-dependent values are `root`, `home`, `vaultRoot` and `node`; everything
else is what the implementation must produce.

```json
{"appRelease":{"root":"/private/var/folders/3v/.../T/wd-lit-uQGxZs/checkout","stance":"dev","version":"0.0.1"},"exec":{"claude":{"commandPath":"/x/bin/claude","installDir":"/x/share/claude/versions"},"git":{"commandPath":"/usr/bin/git","installDir":"/usr/bin"}},"home":"/var/folders/3v/.../T/wd-lit-uQGxZs","job":"dream","maxInputBytes":8000000,"model":null,"node":"/opt/homebrew/Cellar/node/25.9.0_2/bin/node","outerTimeoutMs":1200000,"profileId":"dream","promptHash":"sha256:af74c6ddcabde1f0357ffb7df93eed9205e00a5f0ef9aa191e183cb1536399b7","run":"builtin:dream","schedule":{"at":"03:30","timezone":"local"},"schema":1,"timeoutMs":1200000,"vaultLayout":{"daily_dir":"07-Daily","daily_filename":"YYYY-MM-DD.md","identity_dir":"06-Identity","inbox_dir":"00-Inbox","projects_dir":"01-Projects","reports_dir":"reports/dreams","skills_dir":"05-Skills"},"vaultRoot":"/var/folders/3v/.../T/wd-lit-uQGxZs/vault"}
```

The **only** difference from the same run on unmodified `main` is that
`"appRelease"` there additionally carries
`"treeDigest":"sha256:e6ce2fbc9234bac1d721e398464aef93662cb23b50142dd4894e4155b72c3ea5"`
between `"stance"` and `"version"` (canonical key order). Every other byte is
identical, and `descriptorDigest` is identical.

#### The three RED declarations

Their `id`, `wp` and `criterion` are fixed here so AC8 can name them without a
repo-wide count; the mutation literal, the `marker`, the `testNamePattern` and the
`expectRed` identities are the implementer's. `wp` is
`WP-dev-descriptor-no-tree-hash` for all three; `suite` is
`tests/unit/descriptor.test.js`.

| id | `criterion` | the mutation reintroduces | must redden |
|----|-------------|---------------------------|-------------|
| `dev-arm-recomputes-tree-digest` | `AC1` | `treeDigest: appTreeDigest(paths)` in the **dev** arm | the **AC1** key-set assertion (T1) |
| `reduce-for-digest-spreads-app-release` | `AC2` | `reduceForDigest` spreading `d.appRelease` instead of constructing `{stance, root}` | the **AC2** digest-invariance assertion (T1) |
| `prod-arm-loses-tree-digest` | `AC5` | removal of `treeDigest` from the **prod** arm | `descriptor.test.js:234` — an **existing, unmodified** assertion |

`scripts/red-proofs.js` requires the observed own-body failing set to **equal**
the declared set, so a criterion that only *might* redden cannot be declared.
AC3 and AC4 are deliberately absent from every `expectRed`: both are behavioural
observations of the same dev arm, and declaring them would only restate
`dev-arm-recomputes-tree-digest` while making its failing set non-exact.

**Table E row 3 is not a declaration, and that is a contract statement.** A
declaration file carries exactly one `suite` (`scripts/red-proofs.js` validates
`"suite"` as a single non-empty string). Row 3's mutation lives in
`src/scheduler/launcher.js` and reddens `tests/unit/launcher.test.js` — a
different suite and a file this WP does not own. Its both-directions evidence is
**V6**, which has been executed in both states and whose outputs are recorded
verbatim under Verification steps.

## Contract reference

**Activation (ADR-0031, 2-of-7):** two triggers fire, so the discipline is on.
(i) an on-disk **record shape** changes — the dev `appRelease` object loses a
field; (vii) the same field set is restated in multiple mirrored surfaces (this
spec's Deliverables notes, its acceptance criteria, its verification grep,
`docs/GLOSSARY.md:26`, and ADR-0028's Decision §3 schema block at `:155-161` plus
its owner-signed 2026-07-25 amendment §1 at `:791-797`). One canonical table
below; every mirror is registered under it.

### Table A — descriptor `appRelease` by stance (canonical)

| Stance | Fields written to `<core>/state/descriptors/<job>.json` | Fields the digest sees (after `reduceForDigest`) |
|--------|---------------------------------------------------------|--------------------------------------------------|
| `prod` | `{version, treeDigest, stance:'prod'}` — **unchanged** | all three |
| `dev`  | `{version, stance:'dev', root}` — **`treeDigest` removed** | `{stance:'dev', root}` — **unchanged** |

Two invariants the implementer must preserve, both of them the reason this WP is
safe:

1. `reduceForDigest` (`descriptor.js:254-259`) is **not** edited. Because it
   constructs `{stance, root}` fresh, removing `treeDigest` from the dev input
   provably cannot change any dev descriptor digest — **no dev per-job OS entry
   needs re-minting** (AC2).
2. The prod row is a *preservation* requirement, not a no-op: the prod arm still
   calls `appTreeDigest(paths)` and the prod `treeDigest` remains the value
   `launcher.js:334` compares against at every prod fire (Table E row 4).

### Mirrored Surface Checklist

Table A is the single place these facts are decided. Every surface below restates
them and defers to it, so a review finding updates the table and all its mirrors
in one pass **and in the same commit** — no commit exists in which Table A and a
registered mirror disagree — and any new mirror found in review is added here on
the spot. **The checklist deliberately extends past this spec's own text**: two of
the surfaces live in the repo, not in this file, and an unregistered out-of-spec
mirror is exactly how a contract goes stale (ADR-0031).

- [ ] **Deliverables-table cells that restate a path or rule** — the
      `src/scheduler/descriptor.js` row (**D1**, names the dropped field and the
      untouched neighbours), the `tests/unit/descriptor.test.js` row (names the
      prod assertions that must survive), the
      `tests/red-proofs/dev-descriptor-no-tree-hash.proofs.json` row (**D4**), and
      the `docs/GLOSSARY.md` row (**D2**).
- [ ] **Acceptance criteria that assert its facts** — **AC1** (the dev key set is
      exactly `{root, stance, version}`), **AC2** (dev digest invariance), **AC5**
      (the prod row survives), **AC8** (the three declarations that pin AC1/AC2/AC5).
- [ ] **Verification commands / greps** — **V5** (the dev arm no longer calls
      `appTreeDigest`: three matching lines on `main`, two after), **V9** (the
      unfiltered RED lane), **V10** (the declaration-identity check), and **V1**,
      whose explicit file list is what makes Table A's prod row checkable — it
      names `tests/unit/descriptor.test.js` and
      `tests/unit/scheduler-schedule.test.js`, the two suites holding the prod
      `treeDigest` assertions.
- [ ] **Current-state description** — §1 (the pre-change arm), §2
      (`reduceForDigest`), §3 (the two `appTreeDigestOf` copies), §4 (who reads
      the field), §5 (the two consequences), §8 (the glossary defect), §9 (the dev
      fixture idiom).
- [ ] **Operative prose steps that apply it** — Implementation notes → **D1**
      (the literal replacement value and the comment rewrite), → **D2** (the exact
      glossary wording), → "Migration" table (what happens to everything already
      pinned); "Exact contracts" → the before/after JSON block, the literal
      generated file in full, and the RED-declaration table; Security checklist
      bullet 1; Table E rows 1, 2 and 4; Test index rows T1 and T2.

Out of this spec (registered, not owned):

- [ ] `docs/GLOSSARY.md:26` **job descriptor** — its `appRelease` field list. A
      Deliverables entry of this WP (**D2**), so this mirror moves in the same
      commit.
- [ ] `docs/adr/0028-scheduler-app-executable-integrity.md` — the Decision §3
      descriptor schema block at `:155-161` (`appRelease` shown with `treeDigest`,
      and itself flagged at `:129` as a mirror of WP-156's schema rather than the
      authority) **and** the owner-signed 2026-07-25 amendment: §1's corrected
      field sets (`:791-797`) and §3's closing paragraph (`:930-935`), which relies
      on the dev `treeDigest` being write-only and cites its sole reader as
      `launcher.js:309` — a line number that is now `:334`. **Not** a deliverable
      of this WP (owner-ratification surface; see Out of scope and the Dispatch
      precondition). Registered here so a later Table A change updates it too.

Not registered, and why: `docs/THREAT-MODEL.md:342` and
`docs/runbooks/scheduler-and-executable-integrity.md:146` describe the dev
reduction generically ("every field except `treeDigest`/`version`"; "the app-code
fingerprint is skipped") and describe what the **digest** covers, never the
written field set, so they are not mirrors of Table A.
`tests/scenarios/a7-integrity/README.md:65` ("still RUNS (treeDigest excluded)")
is likewise about the digest. `src/scheduler/launcher.js:334` **reads**
`appRelease.treeDigest` but only on the prod branch, which Table A leaves
untouched.

## Implementation notes & constraints

### D1 — `src/scheduler/descriptor.js`

Change the dev arm of the `appRelease` ternary (`descriptor.js:217-223`) to
`{ version: readVersion(appRoot), stance: 'dev', root: appRoot }` per Table A, and
update the neighbouring comment so it says the dev arm **does not compute** a
tree digest — the current wording ("the digest reduces appRelease to …") is about
`reduceForDigest` and would read, after your edit, as if the field were merely
excluded from the digest rather than never computed. Say why in one clause:
hashing a live checkout is discarded work whose mid-walk `ENOENT` becomes a
refusal (Current state §5).

Do **not** touch the prod arm, `stance` derivation at `:191`, `reduceForDigest`,
`descriptorDigest`, `canonicalize`, `writeDescriptor`, `profileAndPromptHash`, or
`appTreeDigestOf`. `appTreeDigest`/`appTreeDigestOf` stay exported and unchanged —
the prod arm, `src/cli/schedule.js` and the tests all use them.

### D2 — `docs/GLOSSARY.md`: one edit, exactly (exact wording)

In the **job descriptor** entry (`:26`), replace the parenthetical

`` the app release digest (`appRelease`: `version`, `treeDigest`, `stance`) ``

with:

> the app release digest (`appRelease` — on **prod** `{version, treeDigest,
> stance}`; on **dev** `{version, stance, root}`, with **no** `treeDigest`
> computed or recorded)

Leave the entry's existing "**Dev reduction:**" sentence exactly as it is — it
describes what the *digest* covers (`reduceForDigest` → `{stance, root}`) and
Table A does not change that. The two statements are about different things (what
is written vs. what is digested) and both are true after the edit.

No other GLOSSARY entry changes. In particular leave **descriptor digest**
(`:27`), **app release digest** (`:28`), **independent launcher** (`:29`) and
**production/dev stance** (`:31`) alone: this WP changes neither the digest's
definition, nor what the launcher verifies on either path, nor the stance concept.

### D4 — `tests/red-proofs/dev-descriptor-no-tree-hash.proofs.json`

Three declarations, ids and `criterion` values per "Exact contracts". Constraints
`scripts/red-proofs.js` enforces and that have burned earlier packages:

- `id` is a kebab slug, unique across the **whole** declaration directory (13
  files today — count, do not assume).
- `replace` must differ from `find` and must contain `marker`.
- `file` may not be the suite, the runner, `tests/run.js`, or anything under
  `tests/red-proofs/`.
- `expectRed[].test` is an array of full test names, outermost first; `signal` is
  a non-empty substring of the expected diagnostic.
- **The gate is the bare unfiltered `npm run red-proofs` (V9).** A `--wp`-filtered
  run exits **non-zero by construction** — every other declaration's
  `(wp, criterion)` pair is reported `FILTERED` — so it is a reading, never a
  pass. V10's filtered invocation carries `|| true` for exactly that reason. Do
  not pin a repo-wide "N declared proofs" total: a different total means the tree
  moved, not that this WP failed.

### Why the digest's *scope* is not the fix (read before changing your mind)

The obvious reading of "hashing the checkout is expensive and unstable" is that
`appTreeDigestOf` should exclude `.git/` (or `node_modules/`). **Do not do this.**
It is not in the Deliverables table and it is the wrong repair:

1. **It would not make anything stable.** With `.git/` excluded, the digest still
   covers every product file, every doc, and every untracked scratch file in a
   *live working checkout*. Exclusion converts "changes on the next `git commit`"
   into "changes on the next file save".
2. **`node_modules/` exclusion would change nothing anywhere.** It is not in a
   prod tree (`src/core/vendor.js:12` `COPY_INCLUDE = ['bin', 'src', 'skills',
   'templates', 'package.json']`, commented at `:11` *"NEVER copies node_modules
   or .git"*), and the single ADR-approved runtime dependency is not loaded from
   the hashed tree: `googleapis` resolves only from
   `<core>/app/deps/node_modules/googleapis` by direct-path construction with a
   realpath containment check and **no ancestor walk** (`src/gws/deps.js:25`
   `depsDir` = `<core>/app/deps`; `:40-41` `depsPresent`; `:45-46` the "no ancestor
   walk" rationale). `<core>/app/deps` is a **sibling** of `app/current`, outside
   the walked tree.
3. **Git-derived scoping would weaken prod.** Deriving scope from `.gitignore` /
   `.git/info/exclude` / `git ls-files` makes prod integrity depend on files at
   exactly the scoped-write surface A7 defends against — one appended line hides a
   planted file from the digest. The launcher also cannot consult `git` without
   breaking its builtins-only self-containment (`launcher.js:41-44`).
4. **After this WP there is nothing left to stabilise.** No dev code path
   content-addresses the tree, so the instability the exclusion was meant to cure
   does not exist on dev, and on prod it never existed. The change would be pure
   unused mechanism.

`appTreeDigestOf` therefore stays **git-agnostic**: every regular file under
`app/current`, tracked or not, no `.gitignore`, no `.git/index`, no `git`
subprocess. `WP-stance-authority-containment` reached the same conclusion and
recorded it as out of scope for the same reason.

### Migration — what happens to everything already pinned

| Already-bound artifact | After this WP, **before** any `sync` | After one attended `wienerdog sync` |
|---|---|---|
| prod per-job `--expect-digest` | identical value, still verifies | identical |
| **dev** per-job `--expect-digest` | identical value, still verifies (Table A: `reduceForDigest`'s output cannot change) | identical |
| prod catch-up anchor | identical value, still verifies | identical |
| **dev** catch-up anchor | still a stale `sha256:…`; a dev install fails containment first and refuses — **exactly as today, no change either way** | re-minted, still refuses on containment — unchanged by this WP |
| prod descriptor file | identical bytes | identical bytes |
| **dev** descriptor file | stale (still carries `treeDigest`); no dev code path reads it (Current state §4) and its digest is unaffected | rewritten without it, then byte-stable across source edits |

So: **nothing is re-minted, nothing newly fails closed, and no user action is
required.** A dev user who never runs `sync` keeps a stale `treeDigest` in a file
nobody reads, with an unchanged digest. This is ADR-0028 amendment §1's own
conclusion (`:794-797`), not a fresh claim.

### Relationship to the two WPs that share this file

**`WP-stance-authority-containment` — Done, and it landed before you.** It
replaced the forgeable stance oracle (`.git` / `WIENERDOG_DEV`) with realpath
containment inside `<core>/app`. It merged as `86d069e0` on 2026-07-26 and its
spec sits at `docs/specs/done/WP-stance-authority-containment.md` with
`status: Done`. Two consequences for you:

- `descriptor.js:191` now reads `const stance = installStance(paths);`. Any
  instruction you have seen elsewhere about `isDevCheckout(appRoot, env)` in
  `buildDescriptor` is **historical**; `isDevCheckout` survives at
  `vendor.js:48-53` but its own doc comment (`:42-47`) says it "is NOT the stance
  authority" and decides copy-vs-link in `vendorSelf` only.
- That spec **reserved this WP's deliverable explicitly** — its Out of scope
  (`docs/specs/done/WP-stance-authority-containment.md:2871-2875`) names the dev
  `appRelease` arm, `reduceForDigest` and `docs/GLOSSARY.md`'s job-descriptor
  entry as `WP-dev-descriptor-no-tree-hash`'s and forbids pre-empting them. You
  are collecting a reservation, not opening a new front.

**`WP-dream-primary-dialogue-filter` — Draft, far behind you in the queue, and
you owe it nothing.** Its Table D5 plans to bind a canonical serialization of the
filter prompt, model, profile and runtime constants into the existing dream
`promptHash` **inside `src/scheduler/descriptor.js`**. That work lives in
`profileAndPromptHash` (`descriptor.js:93-112`) and in the `promptHash:` field of
the returned object (`:198`); **D1 touches neither, and leaves `promptHash`, its
producer and the digest-coverage of that field exactly as they are**, so that WP
rebases over this one without conflict. Do not pre-build any hook for it.

### General

- No new npm dependencies; plain Node ≥ 18; JSDoc only, no TypeScript, no build step.
- Ambiguity → choose the simpler option and record it under "Decisions made" in
  the PR body. Do NOT expand scope to resolve it.

## Security checklist

- [ ] **No verification is removed, reordered or weakened on either stance.** On
      prod, `appRelease.treeDigest` is still written and still compared at
      `launcher.js:334` (Table A prod row, AC5, Table E row 4). On dev, the field
      removed was never digested and never read (Current state §2, §4), so the
      set of things a dev fire enforces is **identical** before and after: the
      dev-reduced descriptor digest, the bound checkout root
      (`launcher.js:309-312`), and the live containment stance
      (`launcher.js:293`).
- [ ] **No stance signal is introduced, moved or read.** This WP does not add,
      move or read any input that decides prod-vs-dev: it deletes a computed field
      on a branch whose condition (`descriptor.js:191`) it does not touch. The
      durable rule ADR-0028's owner-signed 2026-07-25 amendment §3 states
      (`:865-870`) — *stance must never be selected by a signal that lives inside
      the A7-writable tree* — is **satisfied by the shipped code**: both the mint
      (`vendor.js:281-292` `installStance`) and the fire (`launcher.js:158`
      `liveStance`) decide by containment, and `tests/unit/descriptor.test.js:285-297`
      asserts that a planted `.git` file, a planted `.git` directory and
      `WIENERDOG_DEV=1` all mint **prod**. **Be precise about what that does and
      does not settle.** The amendment's own §3/§4 text still calls that fix "in
      drafting" and still says "A7 is not closed" (`:920-928`, `:953-957`), because
      no later amendment records the landing. This WP changes neither the code nor
      the ADR text on that point; see Dispatch precondition, item 1. Do not cite
      this WP as ratifying anything about stance.
- [ ] **Nothing untrusted flows anywhere new.** No new value reaches a filesystem
      path, a `require`, or a shell command; the edit only *removes* a call. No
      untrusted identifier is introduced, so the anchored-pattern rule has no new
      subject here.
- [ ] **The dev digest is provably unchanged**, so no OS entry silently starts
      accepting a descriptor it previously refused (AC2, executed — Current state §2).
- [ ] No daemon, watcher, poller or background process is introduced (ADR-0004);
      the launcher still runs and exits with each fire.

## Acceptance criteria

**Preamble — a test that passes against unmodified `main` is not evidence.**
Every new test below must be demonstrated **red before the fix and green after**,
and every row of Table E (Mutation checks) must be demonstrated red. Rows 1, 2 and
4 are demonstrated by the machine-run RED lane (AC8); row 3 by V6's executed pair.
Paste every output into the PR body. A *new* verification command that cannot fail
is a defect in this WP, not a pass. (Preservation checks are the deliberate
exception — see the Verification preamble.)

- [ ] **AC1 (dev descriptor: no tree digest).** A dev descriptor's `appRelease`
      has keys exactly `version`, `stance`, `root` — asserted with
      `assert.deepEqual(Object.keys(d.appRelease).sort(), ['root','stance','version'])`,
      not with a `treeDigest === undefined` check, so an added field also fails.
      (T1)
- [ ] **AC2 (dev digest is provably unmigrated).** For a dev install,
      `descriptorDigest(d)` equals `descriptorDigest({...d, appRelease:
      {...d.appRelease, treeDigest: 'sha256:' + '0'.repeat(64)}})` — injecting a
      `treeDigest` back cannot change the digest, so no dev entry needs
      re-minting. (T1)
- [ ] **AC3 (dev derivation reads no source).** During `deriveDescriptorDigest` on
      a dev install, **no** file is read whose path is under the bound checkout
      root and matches `/(^|\/)(src|bin|node_modules|\.git)\//`. Instrumented at
      runtime, not grepped — see the note under the Test index. (T2)
      *No file-count threshold is asserted:* the `setupDevOutside` checkout holds
      three files, so any "fewer than N files" clause with N ≥ 4 cannot
      discriminate between the fixed and unfixed trees and would be a check that
      cannot fail.
- [ ] **AC4 (dev descriptor idempotency — this WP's idempotency criterion).**
      `writeDescriptor` on a dev install returns `changed:false` and leaves
      byte-identical file contents when called again after appending a byte to a
      tracked source file under the checkout. This is the template's
      "running it twice is idempotent" criterion for this WP: `writeDescriptor` is
      the only surface here that writes outside the repo, and on `main` it is
      **not** idempotent on dev (Current state §5, executed: `changed:true`). (T2)
- [ ] **AC5 (prod unchanged).** The existing prod assertions pass **unmodified**:
      `tests/unit/descriptor.test.js:233-235` (a prod `appRelease` still carries
      `version`, a `sha256:` `treeDigest` and `stance:'prod'`) and
      `tests/unit/scheduler-schedule.test.js:1410` (the descriptor written by
      `schedule add` on a contained app tree still carries one). Neither assertion
      may be edited; `scheduler-schedule.test.js` is not even a deliverable.
- [ ] **AC6 (the duplication invariant survived).** `tests/unit/launcher.test.js:274`
      and `:287` — the digest-equality guard between the two `appTreeDigestOf`
      copies — pass **unmodified**, and V6 prints `identical sha256:…` **and
      exits 0** (it throws on inequality, so exit 0 is the assertion, not the
      word). `tests/unit/launcher.test.js` is not a deliverable, so any edit to it
      is a Deliverables violation.
- [ ] **AC7 (mutation matrix).** Every row of Table E was demonstrated red; output
      pasted in the PR.
- [ ] **AC8 (the three RED declarations are PROVEN).** Identified by this WP's own
      `wp` field and by the three ids fixed under "Exact contracts", never a
      repo-wide count. `npm run red-proofs` (unfiltered) exits 0 with
      `RUN: PROVEN`, and within it `dev-arm-recomputes-tree-digest`,
      `reduce-for-digest-spreads-app-release` and `prod-arm-loses-tree-digest`
      each have a `PROVEN` per-proof line and every roll-up line for this WP reads
      `PROVEN`. (V9, V10)
- [ ] **AC9 (the dev fire path is unchanged end to end).** The a7-integrity
      scenarios pass with the env guard ON, including `10a-dev-source-edit` (a dev
      tracked-source edit still RUNS), `10b-dev-at-edit` (a dev `at` edit still
      REFUSES) and `3c-stale-dev` (a `dev`-bound descriptor over a contained tree
      still refuses). These do **not** run under `npm test`, so V3 does not cover
      them; a `SKIPPED` run does not satisfy this criterion. (V11)

### Table E — Mutation checks (each row: apply the mutation to the fixed tree, the named test must turn RED)

| # | One-line source mutation | Test that must go red | Proved by |
|---|--------------------------|-----------------------|-----------|
| 1 | `descriptor.js`: re-add `treeDigest: appTreeDigest(paths)` to the **dev** arm | T1 (AC1) | declaration `dev-arm-recomputes-tree-digest` (V9) |
| 2 | `descriptor.js reduceForDigest`: spread `d.appRelease` instead of constructing `{stance, root}` | T1 (AC2) | declaration `reduce-for-digest-spreads-app-release` (V9) |
| 3 | `launcher.js appTreeDigestOf`: change `pairs.push([childRel, …])` to `pairs.push([e.name, …])` — a **semantic** divergence | existing `tests/unit/launcher.test.js:274` / `:287` (unmodified) + **V6** | V6's executed pair (below) |
| 4 | `descriptor.js`: remove `treeDigest` from the **prod** arm too | existing `tests/unit/descriptor.test.js:234` and `tests/unit/scheduler-schedule.test.js:1410` (both unmodified) | declaration `prod-arm-loses-tree-digest` (V9) covers the first; the second is the manual half — paste it |

Two notes, because two of these rows are subtle:

- **Row 3 must be semantic, not "one byte".** "Change one byte inside
  `appTreeDigestOf`" does **not** turn those tests red if the byte is in a
  comment — the two copies already differ in comments (Current state §3) and the
  tests compare **digests**. `childRel` → `e.name` changes the digest of any tree
  with a nested file, which the `:287` fixture has (`sub/dir/deep.json`).
  **`launcher.js` is not a deliverable — run this mutation against a COPY of the
  file outside the repo, exactly as the recorded run did** (Definition of done 6
  is the proof). Executed at `545df8bd` (`origin/main`): unmutated ⇒
  `identical sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3`,
  **exit 0**; mutated copy ⇒ `Error: DIVERGED
  launcher=sha256:9eb40e34d6cd3fb72d0dbbfc320c97b6acb81f9791cd31656aa197383f54c700
  descriptor=sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3`,
  **exit 1**. Report the exit code; the printed word alone is not the verdict.
- **Row 4 is what stops the edit over-reaching.** Rows 1-2 prove the dev change
  happened; row 4 proves it did **not** happen on prod. Without it, an
  implementer who deleted `treeDigest` from both arms would pass AC1-AC4 and ship
  a silent prod integrity regression. Executed at `545df8bd` with the prod arm
  mutated: `descriptor.test.js:234` and `scheduler-schedule.test.js:1410` both
  failed with `expected: /^sha256:/, actual: undefined`.

### Test index (what to write, and where)

| id | File | What it drives |
|----|------|----------------|
| T1 | tests/unit/descriptor.test.js | a dev fixture's `appRelease` key set (AC1); `descriptorDigest` invariance to an injected `treeDigest` (AC2) |
| T2 | tests/unit/descriptor.test.js | instrumented `fs.readFileSync` during a dev `deriveDescriptorDigest` (AC3); dev `writeDescriptor` idempotency across a tracked-source edit (AC4) |

Build the dev fixture with `setupDevOutside()` (`tests/unit/descriptor.test.js:58-70`),
the helper `WP-stance-authority-containment` introduced; see Current state §9 for
why the old `.git`-planting idiom now mints **prod**. Do not modify
`setupDevOutside` or its existing consumer at `:164-177`.

Instrumentation note for T2: `descriptor.js` calls `fs.readFileSync` as a
property lookup on the `node:fs` module object, so a test can wrap
`require('node:fs').readFileSync` with a recording shim and restore it in a
`finally`. That is the exact runtime gate for AC3 — far stronger than a textual
grep, and it turns red the instant anyone re-adds tree hashing.

## Verification steps (run these; paste output in the PR)

Run everything from the repo root. **Every command below was executed against
unmodified `origin/main` at `545df8bd` while this revision was written; the
"on `main`" line under each one is its real output there.** The counts changed
from the previous revision (recorded at `efd1489`) because the tree grew — use
the numbers below, not remembered ones.

**Three rules, and they are not the same rule.**

1. **Change checks** must print something different after the fix than they do on
   `main`. **V2, V5, V9 and V10 are change checks.** In particular V2's `main`
   count of `ℹ pass 173` is a **FAILURE** after implementation — T1 and T2 add
   tests, so a run that still reports 173 means the only new direct evidence for
   AC1–AC4 was never written. A change check whose `main` output is already its
   success output is a defect in this WP; say so rather than pasting it.
2. **Preservation checks** assert that something did *not* move, so they are
   *supposed* to print the same thing before and after. The carve-out covers
   **exactly four results: V1's `ℹ fail 0` line, V3, V6, and V11** — and nothing
   else. V1's `ℹ pass` count is emphatically **not** covered; it is V2's input. Do
   not "fix" a preservation check by making it fail on `main`.
3. **Exit status is the verdict for V1, V3, V6, V9 and V11 only.** V6 earns that
   by construction: it **throws** on divergence, so a mutation makes it exit
   non-zero rather than merely printing a scary word. **V2, V5 and V10 are judged
   by reading the printed output** — `grep` exits 0 whether it prints two lines or
   three, V2 is a count comparison rather than a command at all, and V10's second
   invocation exits 1 by construction. Never report an exit 0 from those as a
   pass. **V11 has a third failure mode that is neither**: without
   `WIENERDOG_RUN_SCENARIOS=1` it prints `SKIPPED` and exits 0, so its verdict is
   exit 0 **and** a final `PASS` line — a `SKIPPED` run is not evidence.

V4, V7 and V8 were deleted in round 3 with the dev catch-up branch they proved.
The numbering is left gapped on purpose so every surviving command keeps the
identity under which its `main` output was recorded; V9 and V10 are new in this
revision and take fresh numbers for the same reason.

```bash
# V1 (preservation of `fail 0`; its `pass` count feeds V2) — the touched unit
#      file plus the three files whose assertions must survive unmodified, by
#      explicit path (never --test-name-pattern: a pattern that matches nothing
#      exits 0 and proves nothing). MUST go through `npm test --`, NOT a bare
#      `node --test`: tests/run.js sets WIENERDOG_TEST_NO_REAL_SCHEDULER=1 for the
#      whole suite, and without it scheduler-schedule.test.js fails against the
#      real OS scheduler.
npm test -- tests/unit/launcher.test.js tests/unit/descriptor.test.js \
            tests/unit/scheduler-schedule.test.js tests/unit/a7-integrity-negatives.test.js
# on main (executed at 545df8bd):
#   ℹ tests 180 / ℹ suites 0 / ℹ pass 173 / ℹ fail 0 / ℹ skipped 7
# `ℹ fail 0` is the preservation result and must stay 0.

# V2 (CHANGE — anti-vacuity; judged by reading, not by exit status) — this repo's
#      Node (v25) prints the *spec* reporter, not TAP: the summary lines are
#      'ℹ tests N' / 'ℹ pass N' / 'ℹ fail N'. Paste those three verbatim from V1.
#      REQUIRED: `pass` strictly greater than 173 and `fail` exactly 0.
#      `ℹ pass 173` after implementation is a FAILURE of this step, not a pass:
#      T1 and T2 are the only direct tests of AC1-AC4, so an unchanged count means
#      they are missing. Do not invoke the preservation carve-out here — it covers
#      V1's `fail` line, V3 and V6, and explicitly not this count.

# V3 (preservation) — full suite + lint.
npm test
npm run lint
# on main (executed at 545df8bd):
#   npm test  -> ℹ tests 2754 / ℹ suites 0 / ℹ pass 2742 / ℹ fail 0 / ℹ skipped 12
#   npm run lint -> 'Summary: 0 error(s)' / 'frontmatter check passed: 275 spec(s), 4 agent(s)' /
#                   'lint passed'
# Both must still be clean after the fix, with `pass` risen by the T1/T2 tests.
# Executed control: the full suite was ALSO run with D1 already applied and
# reported the same 2754 / 2742 / 0 / 12 — no existing test anywhere in the repo
# depends on the dev arm computing a treeDigest.
# If lint reports an error in a docs/specs/WP-*.md that is NOT this WP's spec, it
# belongs to another architect's in-flight spec sharing your working tree — report
# it under "Discovered issues", do not fix it, and do not let it mask an error in
# a file you own.

# V5 (change) — the DEV arm of the descriptor no longer calls appTreeDigest.
#      Expected AFTER the fix: exactly TWO matching lines — the helper
#      definition and the prod arm. Paste them and confirm neither is inside the
#      `stance === 'dev'` arm.
grep -n 'appTreeDigest(paths)' src/scheduler/descriptor.js
# on main: THREE lines — 72 (the helper), 222 (the dev arm), 223 (the prod arm).
# executed with D1 applied: TWO lines — 72 and 223.

# V6 (preservation; EXIT STATUS is the verdict) — the two appTreeDigestOf copies
#      still agree. The invariant is DIGEST EQUALITY, not textual identity (the
#      bodies already differ in comments — Current state §3), so compare what the
#      two functions RETURN over a hostile-named tree. Two guards make it a real
#      oracle, and BOTH are load-bearing: the shape check (a previous version
#      silently compared two EMPTY strings and printed 'identical') and the
#      inequality THROW. Do not soften the throw back into a printed 'DIVERGED'
#      with exit 0 — that was the round-2 defect: two different valid digests
#      printed a scary word and still exited 0, so the command could not turn red.
node -e "
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const L=require('./src/scheduler/launcher'), D=require('./src/scheduler/descriptor');
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'wd-v6-')));
for (const n of ['a.txt','ünï.md','q\".js','new\nline.txt',path.join('sub','dir','deep.json')]) {
  const f=path.join(root,n); fs.mkdirSync(path.dirname(f),{recursive:true}); fs.writeFileSync(f,'x-'+n);
}
const a=L.appTreeDigestOf(root), b=D.appTreeDigestOf(root);
fs.rmSync(root,{recursive:true,force:true});
const ok=/^sha256:[0-9a-f]{64}\$/;
if(!ok.test(a)||!ok.test(b)) throw new Error('ORACLE BROKEN: '+a+' / '+b);
if(a!==b) throw new Error('DIVERGED launcher='+a+' descriptor='+b);
console.log('identical '+a);"; echo "exit=\$?"
# on main (executed at 545df8bd):
#   identical sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3
#   exit=0
# under Table E row 3 (executed against a patched COPY of launcher.js outside the
# repo, so the real file stayed untouched): stderr `Error: DIVERGED
#   launcher=sha256:9eb40e34d6cd3fb72d0dbbfc320c97b6acb81f9791cd31656aa197383f54c700
#   descriptor=sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3`
#   and exit=1. Report the exit code, not just the text.

# V9 (change; EXIT STATUS is the verdict) — AC8's GATE. Whole tree, UNFILTERED.
#      Requires exit 0 and `RUN: PROVEN`, with this WP's three ids each PROVEN.
#      Never substitute a `--wp` selection here: it exits non-zero by construction
#      while any other WP has declarations (see V10).
npm run red-proofs
# on main (executed at 545df8bd): '66 declared proof(s), 66 selected' / 'RUN: PROVEN'
# / exit 0. This WP declares nothing yet, so its three ids are absent — that
# absence IS the change V9 measures. After implementation the run must still say
# `RUN: PROVEN` with exit 0, and the declared total must be THREE higher than
# whatever it reads on the `main` you branched from. Do not hard-code 69: another
# package landing a declaration moves the total without this WP failing.

# V10 (change; judged by READING) — AC8's identity check plus the readable
#      per-proof view. The second command exits 1 BY CONSTRUCTION (every other
#      declaration is left unselected and rolls up FILTERED); `|| true` is
#      REQUIRED and is what keeps it outside the gate. Never cite it as pass/fail.
node -e 'const d=require("./tests/red-proofs/dev-descriptor-no-tree-hash.proofs.json");
if (d.suite !== "tests/unit/descriptor.test.js") { console.log("FAIL: suite is " + d.suite); process.exit(1); }
const ids = d.proofs.filter((p) => p.wp === "WP-dev-descriptor-no-tree-hash").map((p) => p.id).sort();
const want = ["dev-arm-recomputes-tree-digest","prod-arm-loses-tree-digest","reduce-for-digest-spreads-app-release"];
console.log(ids.join(","));
process.exit(JSON.stringify(ids) === JSON.stringify(want) ? 0 : 1)'
npm run red-proofs -- --wp WP-dev-descriptor-no-tree-hash || true
# on main: the first command exits 1 with MODULE_NOT_FOUND — the declaration file
# does not exist yet. That is the correct RED state for a `create` deliverable and
# is the DELIVERABLE-ABSENT case, not a defect.

# V11 (preservation; EXIT STATUS is the verdict) — the END-TO-END dev-stance fire
#      path. `npm test` does NOT run the a7-integrity scenarios (tests/run.js does
#      not include them) and the env guard SKIPS them silently without
#      WIENERDOG_RUN_SCENARIOS=1 — a run that prints 'SKIPPED' is not a pass and
#      must not be pasted as one. This is the only place `10a-dev-source-edit`
#      (a dev tracked-source edit still RUNS) and `10b-dev-at-edit` (a dev `at`
#      edit still REFUSES) execute against the real launcher, so it is the check
#      that would catch a dev regression the unit suites cannot see.
WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:a7-integrity
# on main (executed at 545df8bd): final line `PASS`, exit 0.
# Executed control with D1 already applied: `PASS`, with
#   ok [3c-stale-dev] / ok [10a-dev-source-edit] / ok [10b-dev-at-edit]
# — the dev fire path is unchanged by the removal.
```

## Out of scope (do NOT do these)

- **Dev catch-up. Do not add a dev branch to `verifyCatchup`, and do not make
  `catchupExpectDigest` stance-shaped.** This was proposed in rounds 1-2 of this
  WP and **rejected by the owner**, recorded in ADR-0028's owner-signed
  2026-07-25 amendment §2 (`:799`). The short form: any dev catch-up branch must
  decide "is this install dev?" from something, and at the time every candidate
  signal — `env.WIENERDOG_DEV`, an on-disk `.git` — was an **A7-scoped write**, so
  an attacker who could perform one got a mint that skipped the tree hash
  entirely. Today the stance authority is containment, which removes that
  particular forgery, but the rejection **stands on its own terms and has not been
  revisited by the owner**: catch-up keeps refusing on a dev install, which is
  WP-157's original disposition. Reopening it is an owner decision and a separate
  WP, not a side effect of this one. Read the amendment before proposing anything
  adjacent.
- **`src/scheduler/launcher.js`, in any form.** In particular its `verifyCatchup`
  doc comment (`:358-378`) is **not** to be edited here. Two observations for the
  record, neither of them work for this WP: its sentence *"There is deliberately
  **NO** dev early-return"* (`:362`) is **true** and stays true — this WP adds
  none; and its clause *"but NOT per-job descriptor authorization (that is
  WP-catchup-per-job-authorization)"* (`:361-362`) is stale, because that WP is
  **Done** and the paragraph at `:368-373` describes what it added. That staleness
  predates this WP, is not caused by it, and belongs to whoever next owns
  `launcher.js`.
- **Excluding `.git/`, `node_modules/`, or any other path from `appTreeDigestOf`,
  in either copy**, and **any git-derived file selection** (`.gitignore`,
  `git ls-files`, `.git/index`). Defended at length in Implementation notes.
- **The stance derivation at `descriptor.js:191`.** It calls
  `installStance(paths)` (`src/core/vendor.js:281-292`). Do **not** change that
  line, do **not** replace it with `isDevCheckout`, and do **not** add an `env`
  parameter anywhere — `buildDescriptor`'s own JSDoc (`descriptor.js:123-126`)
  records that no descriptor field is environment-derived any more, and
  `tests/unit/descriptor.test.js:285-297` and the vendor suite's *"no `.js` under
  `src/` outside the launcher reads `WIENERDOG_DEV`"* test both enforce it.
- **`run-job.js`'s misleading catch-up refusal message.** `catchUp`
  (`run-job.js:1377-1386`) converts *any* `deriveDescriptorDigest` throw into
  *"it is authorized but no longer in your config"*. This WP removes the most
  common cause of that throw on dev; the mislabelling itself remains. Separate WP.
- **`<core>/app/deps/node_modules/googleapis` integrity.** Covered by no anchor
  today, including on prod; a swapped `googleapis` is undetected. Real,
  pre-existing, unchanged by this WP, and it needs its own WP.
- **`docs/THREAT-MODEL.md` and `docs/runbooks/scheduler-and-executable-integrity.md`.**
  Both describe the dev reduction generically and neither restates the written
  field set (Mirrored Surface Checklist, "Not registered"), so no doc edit is
  owed. If review disagrees, that is a doc WP.
- **`docs/adr/0028-scheduler-app-executable-integrity.md`.** Its 2026-07-25
  amendment is **owner-signed**; do not edit it, do not re-mark its status, and do
  not sign anything. Its §3/§4 staleness about `WP-stance-authority-containment` is
  Dispatch precondition item 1, not implementer work.

## Dispatch precondition — owner items

**Status: all three are recommendations adopted under standing authorization, not
direct rulings.** The standing process is recorded in
`docs/specs/logbook/2026-09-17-owner-rulings-felho-integration-3.md` (itself
carrying forward `2026-09-05-owner-rulings-git-env-pinning-queue.md`): the
architect records a recommendation with the cost of overruling it, the session may
dispatch under that recommendation, and the owner reverses any of them by dated
amendment. **Nothing below was approved, accepted or ratified by the owner**, and
none of it blocks dispatch. Each is stated as question / recommendation adopted /
cost of overruling.

1. **ADR-0028's owner-signed 2026-07-25 amendment is stale on its own
   disposition.** §3 (`:920-928`) and §4 (`:945`) describe
   `WP-stance-authority-containment` as "in drafting" and §4's consequence bullet
   (`:953-957`) states "A7 is not closed", but that WP merged as `86d069e0` on
   2026-07-26 and is `status: Done`; no later amendment records the landing. §3
   also cites `launcher.js:309` as the dev `treeDigest`'s sole reader, now `:334`.
   — **Question:** should a follow-on amendment record the landing, and should
   *this* WP carry it? — **Recommendation adopted:** yes to the amendment, no to this WP
   carrying it: a separate docs WP, authored against the ADR as a whole. —
   **Cost of overruling:** adding `docs/adr/0028-*.md` to this Deliverables table
   puts a Sonnet implementer inside an owner-signed document and turns an S into
   an M; the cost of *not* amending at all is that the repo's signed record keeps
   describing a closed violation as open.
2. **The RED-evidence convention is in flux and this spec picks one.** ADR-0042
   (Accepted, OWNER-SIGNED 2026-09-02) defines the `tests/red-proofs/*.proofs.json`
   lane, and the last specs to use it reached Done on 2026-09-06; the two most
   recent Done specs (`WP-dream-filtered-input-budget`, `WP-dream-live-owner-lock`,
   both filed 2026-09-17) instead state a narrative "regression assertions fail
   against the old behaviour and pass against implementation" criterion and list
   no declaration file. This spec adopts the machine-run lane (D4, AC8, V9, V10).
   — **Question:** is the declaration lane what the owner wants for a WP of this
   size? — **Recommendation adopted:** yes here — all three mutations are single-line exact
   substrings against one suite, which is the shape the lane handles best, and the
   lane is the stronger evidence. — **Cost of overruling:** drop D4, AC8, V9 and
   V10 and revert Table E rows 1/2/4 to a hand-pasted red/green pair; one commit,
   no redesign.
3. **The motivating urgency has changed since the WP was filed.** The earlier
   revision argued the defect fires on the maintainer's own nightly dream; that
   install is **prod** today (Current state §7), so the defect is latent for them
   and live only on dev-stance installs. — **Question:** does that change the
   priority of an owner-signed amendment's §1? — **Recommendation adopted:** ship anyway:
   it is four lines of production change implementing a contract the owner already
   signed, and it removes a documented idempotency violation. — **Cost of
   overruling:** shelving leaves `writeDescriptor` non-idempotent on every dev
   install and leaves the `ENOENT`-becomes-refusal path live for anyone who
   installed by `git clone`.

## Definition of done

0. **Before any work starts (the orchestrator's step, not the implementer's).**
   This spec was verified against `origin/main` at `545df8bd`, re-confirmed at
   `2d5e2465` (see the base-pin note under the title). The dispatching session
   re-runs the executable Current-state claims against current `main` and names
   each claim and its result in the dispatch message
   (`docs/runbooks/codex-review.md`, "Dispatch-time re-verification"); a stale
   claim routes this spec back to wd-architect rather than being worked around.
   The implementer starts by confirming V5 prints **three** lines (`72`, `222`,
   `223`) and stops if it does not.
1. Branch `wp/dev-descriptor-no-tree-hash`, off current `main`. Never commit to
   `main`.
2. All verification steps (V1, V2, V3, V5, V6, V9, V10, V11) pass locally; output
   pasted into the PR body, including the Table E mutation evidence (all **four**
   rows, each shown red — rows 1/2/4 via V9's per-proof `PROVEN` lines, row 3 via
   V6's exit-1 run against a copy) and the V2 `ℹ tests / ℹ pass / ℹ fail` counts.
   **V11 is REQUIRED, not optional, and it is the one step the rest of CI cannot
   substitute for.** Run
   `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:a7-integrity` and paste its output
   showing the final `PASS` line together with the three dev-fire case lines
   `ok [3c-stale-dev]`, `ok [10a-dev-source-edit]` and `ok [10b-dev-at-edit]`.
   Without the env variable the suite prints
   `A7 integrity containment proof: SKIPPED` and **exits 0**, so a PR can
   otherwise go green having never executed the dev path this WP changes — a
   pasted `SKIPPED` does not satisfy AC9 and is a failed Definition of done.
3. The PR body states, in one line each: **V5 printed three lines on `main` and
   two after the fix**; **V2's `ℹ pass` is strictly greater than 173** (173 would
   be a failure); **V9 exited 0 with `RUN: PROVEN` and this WP's three ids
   PROVEN**; **V11 printed a final `PASS`, not `SKIPPED`**; and **V1's `ℹ fail 0`,
   V3, V6 and V11 printed the same result before and after** — that last one is
   the preservation claim and it is a pass, not a defect. V6's line must include
   its exit status.
4. Conventional commits; PR titled
   `fix(scheduler): dev descriptor stops hashing the live checkout (WP-dev-descriptor-no-tree-hash)`.
5. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
6. This spec's `status:` flipped to `In-Review` in the same PR.
7. The PR body confirms that `tests/unit/launcher.test.js`,
   `tests/unit/scheduler-schedule.test.js`, `src/scheduler/launcher.js` and every
   file outside the four-row Deliverables table are **untouched** —
   `git diff --stat` and `node scripts/boundary-check.js` pasted as the proof.
8. Both PR review gates have run on the diff and are clean or fully
   dispositioned — they are defined in `docs/runbooks/codex-review.md` and not
   restated here. `In-Review` marks the START of review: this list is complete
   only when review is.

---

**Design gate closed 2026-09-17 at round 1 — `status: Ready`.** The design-review
loop ran once and returned `approve` with **no findings** (Codex plugin 1.0.6
adversarial review, model `gpt-6-astra`, tip `0dfdb58c`, base `545df8bd`; raw
verdict, focus and meta preserved under `docs/specs/logbook/` as
`2026-09-17-dev-descriptor-no-tree-hash-design-r1-astra-{raw.json,focus.txt,meta.txt}`).
`docs/runbooks/codex-review.md`'s weighted closure applies: *"The loop is DONE when
a round finds nothing about the product"* — round 1 found nothing about the
product and nothing about the machinery, so the loop closes without a further
round. Recorded in
`docs/specs/logbook/2026-09-17-dev-descriptor-no-tree-hash-round-zero.md` §8,
including what the reviewer executed versus what it only read. The three owner
items above are recommendations adopted under standing authorization; they are not
rulings and they do not gate this flip.
