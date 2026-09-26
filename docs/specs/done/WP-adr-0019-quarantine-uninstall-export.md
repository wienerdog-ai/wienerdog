---
id: WP-adr-0019-quarantine-uninstall-export
title: Superseded — split into the uninstall gate and the shelf deletion guards
status: Superseded
model: opus
size: M
depends_on: [WP-secret-fence-ep2-redact-arm, WP-scheduler-replay-manifest-independent, WP-quarantine-only-copy-shelf]
adrs: [ADR-0004, ADR-0019, ADR-0024, ADR-0031, ADR-0034, ADR-0035, ADR-0038, ADR-0041, ADR-0042]
epic: secret-lifecycle
---

# WP-adr-0019-quarantine-uninstall-export: SUPERSEDED by two packages

**This spec was split on 2026-09-18, immediately after its design gate closed.**
Do not implement it. Its work lives in:

- **`docs/specs/WP-adr-0019-quarantine-uninstall-gate.md`** — the **gate**:
  `quarantineInventory`, the pre-plan refusal, the ADR-0019 amendment, the two
  user-facing sentences. Tables **K** (with **K8**), **W1**–**W7**/**W9**,
  **Y1**–**Y5**/**Y7**/**Y8**; owner items **1**, **2**, **3**.
- **`docs/specs/WP-uninstall-shelf-deletion-guards.md`** — the **deletion side**:
  the carve-out in `disposeCoreMechanics` and the shelf guard in `reverse()`.
  Tables **X** and **V**, rows **W8**/**W10**/**W11** and **Y6**/**Y9**/**Y10**;
  owner item **4**; the three named residuals. It `depends_on` the gate.

## Why it was split

The design gate ran **22 rounds** on this one document (rounds 1–21 produced 17
band-A/HEAVY findings and 4 LIGHT ones, every one accepted in full; round 22
returned `approve` with no findings). Each round that closed a measured hole added
a contract row, and by round 21 the file had reached **~1,950 lines, six canonical
tables — Table X alone carrying 22 rows — 26 RED declarations and 13 acceptance
criteria with roughly 45 arms.**

CLAUDE.md sizes a work package at **one implementer session and one PR**, and
ADR-0005's One-Document Rule aims it at a mid-tier model reading that spec and
nothing else. This document had stopped being either. `docs/runbooks/spec-authoring.md`
names the shape in as many words — *"how a 300-line contract becomes an 800-line
fortress"* — and it was past twice that.

**The cut is where the risk changes, not where the line count halved.** The gate
touches **no deleter**: it is safe on its own and strictly better than `main`, where
the shelf is destroyed unconditionally and silently, and it is exactly what the
owner's 2026-07-27 *"C now + B as follow-on"* named. The deletion side carries every
rule a review round measured a hole for, and **cannot be subdivided further without
shipping one of those holes knowingly** — rounds 11–21 each found a path that the
previous round's partial rule left open.

**The split was deliberately made AFTER the gate closed, not during it.** Splitting
mid-gate would have restarted both gates and orphaned 21 rounds of dispositions keyed
to row ids in this file. Done afterwards it is a mechanical extraction: **every
contract row keeps its original id** — `K`, `W`, `X`, `V`, `Y` letters and numbers
unchanged, including the gap where **X14** never existed — so every disposition still
resolves. Acceptance criteria are renumbered within each spec, and the closing section
of the dispositions logbook maps the old numbers to the new.

## Where the record lives

`docs/specs/logbook/2026-09-18-adr-0019-quarantine-uninstall-export-design-review.md`
holds all 22 rounds, each raw and focus committed **before** adjudication, and the
row-id-to-package map. **A review gate is not owner approval:** nothing in this
repository records the owner approving, accepting, ratifying or signing this work, and
the ADR-0019 amendment it drafts carries *"owner signature pending"*. Owner items 1–4
remain open, in the standing form, on the two packages named above.
