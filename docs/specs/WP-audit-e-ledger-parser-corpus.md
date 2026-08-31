---
id: WP-audit-e-ledger-parser-corpus
title: Ledger-parser correctness — three-state trust reader, null-prototype collector, contract-complete hostile corpus
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0004, ADR-0020]
epic: audit-close
---

# WP-audit-e-ledger-parser-corpus: Ledger-parser correctness — three-state trust reader, null-prototype collector, contract-complete hostile corpus

> **Draft stub from the 2026-08-31 handover — the harvested content of the
> audit's GROUP E ruling (2026-08-05), previously only in war-room
> material.** Citations measured 2026-08-05; **re-measure before Ready**.
> One more thing is inherited here and it is the loudest: the archive
> predecessor of this WP ran **twelve review rounds and never closed**
> (24→15→16→9→10→6→9→7→9→4→6→7 findings). E is the smallest group in code
> changed and the only one with a measured history of expensive
> verification. **Watch the size discipline first**, and hold gates to
> behavioral (run-the-validator) checks, not source-shape findings — that
> switch is what ended the archive loop.

## Context (read this, nothing else)

Two defects in the skill-learnings ledger parser
(`src/core/dream/validate.js` at the time):

1. **Trust washing:** `cur.untrusted = val === 'true'` (`:415`) makes every
   other spelling of `derived_from_untrusted` read as `false` = trusted, and
   the authorization gate consumes that washed value (`:372`). The schema
   check (`:432`) cannot fire on a present-but-misspelled value. The
   absent-field case is correct today (initializer leaves `null`, `:432`
   rejects) — pin it against regression, do not "fix" it.
2. **Prototype pollution:** the collector is a plain object keyed by heading
   text, so a `## __proto__` heading sets its prototype; all three schema
   loops use `Object.entries`. This makes `ADR-0020:78` ("every `##` entry
   validates against the schema") a live false claim.

Measured corrections that shaped the ruling (each defeated a naive fix):

- **Two paths, not one**: the schema check guards only the keep/revert path;
  the AUTHORIZATION path reads the parsed entry with no schema check at all.
  The collector fix protects the former, the trust-predicate fix the latter.
- **A minimal patch passes a naive corpus**: rejecting only `TRUE` leaves
  `False` trusted — and a `False` ledger then authorizes a Tier-3 skill-body
  revision. The corpus must be complete against the CONTRACT, not a spelling
  list.
- **Duplicate detection by adjacency is defeated** by `## a`, `## b`, `## a`.
- `cur[key]` / `headEntries[key]` traverse the prototype chain;
  `constructor` passes the pattern-key regex (underscores excluded save
  `__proto__`, but `constructor` matches) and safety there is two checks
  coinciding, not a designed property. The regex exists TWICE (inline and as
  `PATTERN_KEY_RE`) — byte-identical then; keep them identical or unify.

## The ruled fix

1. **Trust predicate:** reuse the shipped three-state reader
   (`src/core/frontmatter.js:115-121` then, exported): absent → undefined,
   `'false'` → false, `'true'` → true, anything else → INVALID. Its
   signature takes a Map while the ledger handles bullet lines — factor a
   shared value-level helper rather than adapting one call site.
2. **Collector:** `Object.create(null)`. State in-body that `ADR-0020:78`
   thereby becomes TRUE (no live ADR weakened).
3. **Sibling sweep, bounded by measurement:** `parseFrontmatter`'s
   `data = {}` in scope (same construction, one-line close);
   `headEntries = {}` explicitly OUT (measured unobservable — overwritten on
   the next line). Re-verify both claims.
4. **Repeated heading: reject or warn, never silent overwrite** — with a
   NON-adjacent duplicate row in the corpus.
5. **The corpus is the deliverable**: invalid spellings beyond `TRUE` (at
   minimum `False`, `FALSE`, `yes`, `1`, empty), a non-adjacent duplicate, a
   field-ABSENT row (pins today's correct behavior against regression), and
   a hostile row on EACH path (keep/revert and authorization).

## Watch out

- E and anything touching `validate.js` are sequential, never concurrent.
- The archive spec and its twelve round logs are the best evidence input —
  the corpus design is already paid for. They live on the preserved branch
  `wp/audit-b3b1-ledger-parser-hardening` (pushed to origin at handover,
  head `b07d4bc`; read-only evidence — do not build on it).
