---
date: 2026-09-17
related_wps: [WP-dev-descriptor-no-tree-hash]
---

# WP-dev-descriptor-no-tree-hash: re-derivation against current main, and round zero

Reviewed base: `origin/main` at `545df8bd` (`545df8bd33ccd3dc5f2ecb9031d2fdcb0c9cf81c`, the tip of
`docs/ready-dev-descriptor-no-tree-hash` at branch creation). The previous
revision of the spec was written against `efd1489`; `src/scheduler/descriptor.js`
and `src/scheduler/launcher.js` both moved in between, so every executable claim
and every `file:line` cite was re-derived from source rather than carried
forward. All commands below were run from the worktree
`.claude/worktrees/agent-ad7420c90036add96`. No production file was left modified:
each simulated edit was applied, measured, and reverted with
`git checkout -- src/scheduler/descriptor.js`, and the launcher mutation was
applied to a **copy outside the repo**, never to the file.

This is an architect's round-zero record. It is not an independent adversarial
verdict, and nothing here is an owner ratification.

## 1. The failure mode is CONFIRMED

Both halves of the claim hold on `545df8bd`:

- `src/scheduler/descriptor.js:222` — the dev arm still calls
  `appTreeDigest(paths)`:
  `{ version: readVersion(appRoot), treeDigest: appTreeDigest(paths), stance: 'dev', root: appRoot }`
- `src/scheduler/descriptor.js:254-259` — `reduceForDigest` still rebuilds
  `{ stance: 'dev', root: d.appRelease.root }` from scratch, so the field the dev
  arm just computed is never digested.
- `src/scheduler/descriptor.js:52` stats a directory entry and `:56` reads it, and
  nothing between `appTreeDigestOf` and `buildDescriptor` catches; the throw
  surfaces at `src/scheduler/launcher.js:352-355`
  (`integrity check errored: …`) and at `src/cli/run-job.js:1377-1386` (the
  misleading *"it is authorized but no longer in your config"*).
- `grep -rn treeDigest src bin tests` shows exactly one production reader,
  `launcher.js:334`, on the **prod** branch.

Measured, not read: against a `setupDevOutside`-shaped dev fixture on unmodified
`main`, appending one byte to the checkout's `bin/wienerdog.js` made
`writeDescriptor` return `changed:true` while `descriptorDigest` was **unchanged**
— the documented idempotency (`descriptor.js:277`) is false on dev today. With the
one-line D1 edit applied the same run returned `changed:false`.

## 2. What changed under the spec since `efd1489`

`WP-stance-authority-containment` landed (`86d069e0`, 2026-07-26,
`docs/specs/done/WP-stance-authority-containment.md`, `status: Done`) and rewrote
the stance authority. Every cite below was wrong in the previous revision and has
been corrected.

| Claim / cite in the previous revision | Current truth on `545df8bd` |
|---|---|
| `descriptor.js:186` — `stance` from `isDevCheckout(appRoot, env)` | `descriptor.js:191` — `installStance(paths)`; containment only (`vendor.js:281-292`) |
| `descriptor.js:212-219` (the `appRelease` ternary) | `:217-223` (dev arm `:222`, prod arm `:223`) |
| `descriptor.js:249-254` / `:257` / `:272` / `:280` / `:178` | `:254-259` / `:261-264` / `:277` / `:285` / `:181` |
| `launcher.js:125-139` (2nd `appTreeDigestOf`) | `:130-144`, doc `:124-129` |
| `launcher.js:36-39` (builtins-only requires) | `:41-44`; the design point is stated at `:22-31` |
| `launcher.js:308` / `:309` (prod tree hash / expectTree) | `:333` / `:334` |
| `launcher.js:326-328` (outer catch) | `:352-355` |
| `launcher.js:288-299` (dev arm) | `:301-323`; now `liveStance(p)` at `:293`, bound root at `:309-312` |
| `launcher.js:240-248` (`reDeriveDigest` requires) | `:253-261` |
| `launcher.js:331-351` / `:335-336` / `:334-335` (verifyCatchup doc) | `:358-378` / `:362` / `:361-362` |
| `launcher.js:364` (catch-up tree gate) | `:391`, with containment at `:389` |
| `run-job.js:1136-1145` | `:1377-1386` |
| `vendor.js:30-36` `isDevCheckout(root, env)`; `vendor.js:7` `COPY_INCLUDE`; `vendor.js:200-206` | `:48-53` `isDevCheckout(root)`, no `env`, explicitly "NOT the stance authority" (`:42-47`); `COPY_INCLUDE` at `:12`, comment `:11`; `installStance` at `:281-292` |
| `gws/deps.js:46` ("no ancestor walk") | `:45-46` |
| `descriptor.test.js:208-209` (prod assertions) | `:233-235` |
| `descriptor.test.js:138-147` (dev fixture idiom) | the idiom is **gone**: a `.git` inside `<core>/app` now mints **prod** (`:285-297`). The dev fixture is `setupDevOutside()` at `:58-70`; its consumer is `:164-177` |
| `scheduler-schedule.test.js:1194` | `:1410` |
| `launcher.test.js:211` / `:224` | `:274` / `:287` |
| `GLOSSARY.md:25` (**job descriptor**) | `:26`; **descriptor digest** `:27`, **app release digest** `:28`, **independent launcher** `:29`, **production/dev stance** `:31` |
| ADR-0028's 2026-07-25 amendment is "`Proposed` and unsigned" | `Status: **Accepted. OWNER-SIGNED 2026-07-26.**` (`docs/adr/0028-…:752`). Its §1 (`:791-797`) already states this WP's corrected contract |
| "the maintainer's own install is dev" | **FALSE.** `~/.wienerdog/app/current -> ~/.wienerdog/app/0.13.0` — contained, so **prod**. Claim withdrawn in Current state §7 |
| "`WP-stance-authority-containment` … another architect is drafting" | Done since 2026-07-26; and its own Out of scope (`:2871-2875`) reserved this WP's three edit targets |

Cited ranges were checked at **both** ends (`launcher.js:301-323` and
`:358-378` were each off by one at the closing end in the first pass of this
revision and were corrected).

## 3. Template conformance

Checked against `docs/specs/_TEMPLATE.md`'s section list. Every section is
present; none is silently absent.

| Template section | State |
|---|---|
| Context (read this, nothing else) | present |
| Current state | present (§1–§9) |
| Deliverables (permission boundary) | present, 4 rows, header comment matches `scripts/boundary-check.js`'s allowed set |
| Exact contracts | present, **including the literal generated file in full** — the template requires it for file-generating code and the previous revision had only a JSON fragment |
| Contract reference | present, not `N/A`: ADR-0031 triggers (i) and (vii) both fire |
| — Contract table(s) | Table A |
| — Mirrored Surface Checklist | present, and now **leads with the template's five bullets in their literal wording**, each followed by tailored elaboration; the previous revision had replaced them with a custom list, which is the item this repo's clean-context conformance reads have failed three sibling specs on |
| Implementation notes & constraints | present |
| Security checklist | present |
| Acceptance criteria | present (AC1–AC9); the template's idempotency criterion is **AC4**, named as such rather than left implicit |
| Verification steps | present |
| Out of scope | present |
| Definition of done | present, now including the template's item 5 (both PR review gates), which the previous revision omitted |

One section is outside the template and deliberate: **Dispatch precondition —
owner items** (see §6).

## 4. Runnable claims — executed, per-criterion exit status

Every command with a runnable form was run on the pinned base, and each was also
run in its opposing direction. `main` = unmodified `545df8bd`; `D1` = the one-line
dev-arm edit applied and then reverted.

| # | Command | Direction | Result | Exit |
|---|---|---|---|---|
| V1 | `npm test -- launcher/descriptor/scheduler-schedule/a7-integrity-negatives` | main | `ℹ tests 180 / pass 173 / fail 0 / skipped 7` | 0 |
| V1 | same | D1 | `ℹ tests 180 / pass 173 / fail 0 / skipped 7` — unchanged | 0 |
| V1 | same (descriptor + scheduler-schedule only) | Table E row 4 (prod arm mutated) | RED: `descriptor.test.js:234` and `scheduler-schedule.test.js:1410` both `expected /^sha256:/, actual undefined` | non-zero |
| V2 | count comparison over V1 | main | baseline `pass 173`; the post-fix requirement is strictly `> 173` | n/a |
| V3 | `npm test` | main | `ℹ tests 2754 / pass 2742 / fail 0 / skipped 12` | 0 |
| V3 | `npm test` | D1 | `2754 / 2742 / 0 / 12` — identical; **no test anywhere depends on the dev arm hashing** | 0 |
| V3 | `npm run lint` | main | `Summary: 0 error(s)` / `frontmatter check passed: 275 spec(s), 4 agent(s)` / `lint passed` | 0 |
| V5 | `grep -n 'appTreeDigest(paths)' src/scheduler/descriptor.js` | main | THREE lines: 72, 222, 223 | 0 |
| V5 | same | D1 | TWO lines: 72, 223 | 0 |
| V6 | the two-copy digest oracle | main | `identical sha256:4de344d153248682accd1443815d78b85e0395f297b0f1f05d2e43b2d281bda3` | 0 |
| V6 | same, against a **copy** of `launcher.js` with `childRel` → `e.name` | Table E row 3 | `Error: DIVERGED launcher=sha256:9eb40e34d6cd3fb72d0dbbfc320c97b6acb81f9791cd31656aa197383f54c700 descriptor=sha256:4de344d153…` | 1 |
| V9 | `npm run red-proofs` (unfiltered) | main | `66 declared proof(s), 66 selected` / `RUN: PROVEN` | 0 |
| V10 | the declaration-identity `node -e` | main | `MODULE_NOT_FOUND` — the **deliverable-absent** case, correctly RED | non-zero |
| V11 | `WIENERDOG_RUN_SCENARIOS=1 npm run scenarios:a7-integrity` | main | final `PASS` | 0 |
| V11 | same | D1 | final `PASS`, with `ok [3c-stale-dev]`, `ok [10a-dev-source-edit]`, `ok [10b-dev-at-edit]` | 0 |
| V11 | `npm run scenarios:a7-integrity` **without** the env guard | main | `A7 integrity containment proof: SKIPPED` | 0 |
| AC1 | `Object.keys(d.appRelease).sort()` on a dev fixture | main | `["root","stance","treeDigest","version"]` | — |
| AC1 | same | D1 | `["root","stance","version"]` | — |
| AC2 | `descriptorDigest(d) === descriptorDigest({…treeDigest injected})` | main | `true` | — |
| AC2 | same | D1 | `true` — invariance holds in **both** states, which is the migration argument | — |
| AC4 | `writeDescriptor` again after a tracked-source byte | main | `changed:true`, `digest` unchanged — **non-idempotent** | — |
| AC4 | same | D1 | `changed:false` | — |

Three findings came out of running these rather than reading them:

1. **V11 did not exist and V3 did not cover it.** `tests/run.js` does not include
   the a7-integrity scenarios, so `npm test` never exercises `10a-dev-source-edit`
   or `10b-dev-at-edit` — the only end-to-end dev-stance fire cases in the repo.
   Added as V11/AC9, with the `SKIPPED`-exits-0 trap called out explicitly.
2. **AC3's "fewer than 10 files" clause could not discriminate.** The
   `setupDevOutside` checkout holds three files, so the threshold is satisfied
   before and after the fix. The clause is removed; the path-shape regex, which
   does discriminate (`bin/wienerdog.js` matches), is kept, and the spec now says
   why no count is asserted.
3. **V9/V10's `main` outputs are the deliverable-absent case**, which
   `docs/runbooks/spec-authoring.md` asks to be observed on purpose. Both are
   recorded as RED above rather than assumed.

The previous revision's `main` numbers (`pass 117`, `tests 120`, `pass 1666`,
`tests 1671`) are stale by a wide margin and every place that quoted them —
including the V2 threshold and Definition of done item 2 — was updated to 173 /
180 / 2742 / 2754.

## 5. Internal coherence findings fixed in this pass

- Current state §6 was a measurement protocol ("do not re-derive these numbers",
  with the drift rationale). `docs/runbooks/spec-authoring.md` asks for one
  provenance line instead; it now cites ADR-0028 `:779-789`, which records the
  same figures in an owner-signed document.
- The Security checklist's second bullet asserted an **unresolved** stance
  violation and told the reader not to treat the dev path as safe. The code no
  longer has that shape. Rewritten to state what the code does now
  (`installStance` / `liveStance`, both containment), with the named test that
  enforces it, and to say plainly that ADR-0028's §3/§4 *text* has not caught up —
  which is an owner item, not a code claim.
- "Relationship to `WP-stance-authority-containment`" argued at length for why
  this WP need not wait for a WP that has since merged. Replaced with the two
  facts that matter: the stance line already reads `installStance(paths)`, and
  that spec's Out of scope reserved these three edit targets for this WP.
- The Out-of-scope "dev catch-up" bullet asserted that the rejection rests on
  `.git`/`WIENERDOG_DEV` being forgeable. Containment removed that particular
  forgery, so the bullet now says the rejection stands on its own terms and has
  not been revisited by the owner, rather than re-deriving a rationale that has
  partly lapsed.
- The Out-of-scope "stance oracle" bullet described an attack
  (plant-`.git`-then-`sync`) that `tests/unit/descriptor.test.js:285-297` now
  asserts cannot work. Rewritten as a don't-touch boundary around
  `descriptor.js:191`.
- Table E gained a "Proved by" column so each row names its evidence lane; row 3's
  exclusion from the RED-proof lane is now a stated contract (one `suite` per
  declaration file) rather than an unexplained gap.
- The forward interaction with the Draft `WP-dream-primary-dialogue-filter` (its
  Table D5 binds additional inputs into the dream `promptHash` inside
  `src/scheduler/descriptor.js`) is recorded in Implementation notes: that work
  lives in `profileAndPromptHash` (`descriptor.js:93-112`) and the `promptHash:`
  field (`:198`), and D1 leaves both untouched.

## 6. Owner items raised, not decided

Three, written into the spec's **Dispatch precondition — owner items** as
question / recommendation / cost of overruling:

1. ADR-0028's owner-signed 2026-07-25 amendment is stale on its own disposition —
   §3 (`:920-928`) and §4 (`:945`, `:953-957`) still call
   `WP-stance-authority-containment` "in drafting" and state "A7 is not closed",
   and §3 cites `launcher.js:309` for a reader now at `:334`. Recommendation: a
   separate docs WP amends it; this WP must not edit an owner-signed document.
2. The RED-evidence convention is in flux. ADR-0042's `tests/red-proofs/*.proofs.json`
   lane is Accepted and OWNER-SIGNED 2026-09-02, and the last specs to use it
   reached Done on 2026-09-06; the two most recent Done specs
   (`WP-dream-filtered-input-budget`, `WP-dream-live-owner-lock`, both filed
   2026-09-17) use a narrative regression criterion and declare no proofs file.
   This revision adopts the machine-run lane (D4/AC8/V9/V10) and says so, so the
   choice is visible and cheap to overrule.
3. The motivating urgency changed: the defect no longer fires on the maintainer's
   own install (now prod). Recommendation: ship anyway — it implements §1 of an
   owner-signed amendment and removes a documented idempotency violation.

None of these was decided here, and nothing in the repo records the owner
approving, accepting or ratifying any of them.

## 7. Tree state

`src/` is byte-identical to `origin/main` at the end of this pass; the only
changed files are the spec and this entry. `npm run lint` → `lint passed`;
`git diff --check` → clean. The spec stays `status: Draft`.
