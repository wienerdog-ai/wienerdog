# ADR-0038: An untrusted manifest field may only narrow a deletion, never widen one

Status: Proposed — awaiting owner signature
Date: 2026-08-02

> **WHERE THE SIGNATURE GOES, STATED EXACTLY.** On its own line immediately below
> the `Date:` line above, in the plain form the ratified ADRs in this directory
> carry in their header region — the ratification token, a separator, and an ISO
> date. **ADR-0035's header is the shape to copy.** That line is deliberately
> absent here, and the token is deliberately not written out anywhere in this
> file, **not even as a template or as an example**: no agent ever types it, for
> any reason, including "showing where it goes". Spelling the negative in words
> rather than writing `NOT <token>` is itself the lesson — this repo has already
> shipped a ratification gate that passed on the sentence explaining the gate
> (`docs/specs/logbook/2026-07-26-derived-predicates-need-their-tools-registered.md`).
>
> **Until that line exists, this ADR binds nobody.** No spec, agent definition,
> template or runbook is governed by it today, and no document may cite it as
> authority. Documents that cite it now cite it as a *proposal*.
>
> **Authorized for drafting by the owner in session on 2026-08-02** — verbatim,
> as the third of three answers: *"1) ship as specified 2) ship 4a+4b 3) draft
> the ADR"*. **TRANSCRIBED, NOT OWNER-TYPED.** That authorization covers writing
> this file; it is not a signature on its content.

## Context

`wienerdog uninstall` replays `~/.wienerdog/install-manifest.json` in reverse to
remove exactly what the installer created. That file is **plaintext, user-
editable and attacker-writable**, and its contents are the *only* thing standing
between the reverser and a `fs.unlinkSync` / `fs.rmSync` / file rewrite. WP-144
established the premise; three separate gate rounds since have found the same
class of defect underneath it, each time in a field that had been added for a
good reason:

- **A forged separator was a file-emptying primitive.** WP-147 measured it: with
  unbounded `sepBefore`/`sepAfter`, a hand-edited manifest turned an uninstall of
  `"lineA\n<BLOCK>\nlineB\n"` into `""`.
- **A forged `(path, target)` pair was delete authority.** WP-153's gate round 4
  showed an attacker could name *any* symlink the user owned under a harness
  skills root, set `target` to that link's own destination, and have uninstall
  remove a file Wienerdog never created.
- **A recorded target could authorize a delete the semantic proof refused.**
  `WP-symlink-lexical-fallback-removal` (PR #151) removed row 3's raw link-text
  comparison for exactly this reason.

Each was fixed locally and each fix was rediscovered independently. The rule
underneath them has never been written down, so every new field re-derives it —
and the two specs this ADR is drafted alongside reached **opposite** validation
decisions from it, which is precisely the point at which an unwritten rule starts
looking like an inconsistency instead of a principle.

## Decision

**A field read from the install manifest may only ever NARROW what uninstall
deletes. It may never widen it. For every possible value of every manifest
field — absent, well-formed, malformed, or forged — the set of filesystem
mutations the reverser performs must be a SUBSET of the set it would perform if
that field were absent.**

Three corollaries, each of which is the operative form in a different situation:

1. **Absence is the baseline, and the baseline is the previously shipped
   behavior.** A missing field must reproduce what the code did before the field
   existed. This is what keeps `uninstall` reversible across an upgrade: entries
   written by older versions lack the new field permanently (there is no
   backfill), and if absence made deletion *stricter*, every pre-existing install
   would stop removing its own artifacts.
2. **A field may serve as a proof obligation, never as a proof.** Evidence in the
   manifest can make the reverser refuse a deletion it would otherwise perform.
   It can never be the thing that authorizes one. Where a field is compared
   against the live filesystem, the *filesystem* is the authority and the field
   is the claim.
3. **Malformed input degrades toward preservation, and the degradation target is
   chosen per kind by asking which direction is safe for that artifact** — see
   "Two validation postures" below. It is never chosen by asking which is
   tidier.

## The two validation postures, and why both obey this rule

The rule fixes the *direction* of failure, not the *mechanism*. The two specs
drafted with it take opposite mechanical decisions on the same schema table, and
both are correct:

| | `{kind:'managed-block'}` `anchorBefore` | `{kind:'symlink'}` `origin`/`dev`/`ino` |
|---|---|---|
| Listed in `ENTRY_FIELD_TYPES`? | **No** | **Yes** |
| A non-string value therefore… | reaches the reverser and degrades to the legacy strip | is rejected by `validateEntry`, and `reverse()` skips the entry |
| …which means the artifact is | **still removed** (the block comes out) | **preserved** (the link stays) |
| Why that is the narrowing direction | a rejected `managed-block` entry leaves Wienerdog's block **installed in the user's `CLAUDE.md` forever, with no path to removal** — that is not preservation, it is an unremovable leftover, and an attacker could induce it at will | a rejected `symlink` entry leaves a symlink in place. Preserving a link is exactly the safe failure |

**The same rule produces opposite type-gating decisions because the artifacts
differ in what "failing safe" means.** For a block spliced into a file the user
owns, safety is *getting our bytes out*; for a link, safety is *not deleting*.
Anyone applying this ADR to a new field must answer that question first, and the
answer is a property of the artifact, not of the field.

## The shipped instances this ADR codifies

This is **codification of behavior already in `main`**, not a new constraint:

| Instance | Where | The narrowing |
|---|---|---|
| Schema validation | `validateEntry` + `reverse()`'s pre-dispatch skip | a malformed entry never reaches a reverser |
| Containment | `withinAllowedRoot` (WP-144) | an entry naming a path outside every Wienerdog-owned root is preserved |
| Separator vocabulary | WP-147's `SEP_BEFORE_OK` allowlist | anything outside `''`/`'\n'`/`'\n\n'` degrades to the legacy one-newline strip; the file-emptying primitive is gone |
| Legacy symlink entries | WP-153 Table A **row 2** | a target-less entry is preserved unconditionally (owner-ruled 2026-08-01) |
| Structural ownership | WP-153 Table A **row 4** | a forged `(path, target)` pair still has to name a `wienerdog-*` link directly under a harness skills root |
| Semantic-proof-only row 3 | PR #151 (`91b12e2`) | the recorded target can no longer authorize a delete `realpath` refuses. Its own commit message states the rule: *"a recorded target may narrow this delete, never authorize one the semantic proof refuses"*, and *"strictly narrowing: every input this now preserves was previously deleted"* |
| Insertion anchor | `WP-managed-block-insertion-anchor`, Table N | absent or non-hex ⇒ shipped behavior; any other value withholds a strip. Measured over its whole value space |
| Link identity | `WP-symlink-authorship-identity`, **Table S** | **all twenty** schema-accepted `{origin, dev, ino}` shapes measured end-to-end: every one is `removed` at base, so **every preserved cell is a narrowing and no cell is a widening** |

Table S is the strongest existing evidence for this ADR: it is an exhaustive,
measured demonstration of the rule over one field group's entire accepted input
space, rather than an argument that the rule holds.

## The non-provenance, recorded because it was wrong for months

**This rule is NOT in ADR-0019 and never was.** Four specs in this repository
have attributed the sentence *"anything it cannot prove it created is
preserved"* to ADR-0019. Measured on 2026-08-02: the word *"prove"* appears
**zero** times in `docs/adr/0019-uninstall-disposes-core-mechanics.md`, and no
ADR in `docs/adr/` contains the phrase *"cannot prove"*. ADR-0019 is a
**completeness-mandating** ADR — it requires uninstall to remove the core's
machine-generated mechanics, and its **sole documented exception** is a
user-modified `config.yaml`.

Two things follow, and both matter more than the correction itself:

- The rule was **load-bearing across four specs while existing nowhere**, which
  is the strongest available argument for writing it down.
- A misattributed citation is worse than a missing one, because it terminates
  inquiry. Anyone who checked the citation would have found nothing; anyone who
  did not check inherited a false certainty. **The `Done` specs carrying it are
  not edited** — they describe what they shipped — so this ADR is the correction's
  home.

## What this rule does NOT cover

Stated so the boundary is not re-derived, and so nobody claims more from a
signature than it gives:

- **It is not manifest integrity.** An attacker who can rewrite the manifest can
  always *delete* a field and get the pre-field behavior. This rule bounds the
  damage of forged content; it does not authenticate the file. Signing/HMAC is a
  separate design, deliberately not built: the file carries no integrity
  protection at all, and protecting one field while the rest is unprotected buys
  nothing.
- **It does not make uninstall complete.** Narrowing costs completeness by
  construction — that is the trade, and it is why both 2026-08-02 rulings were
  owner decisions rather than architect ones. This ADR does not pre-authorize
  future completeness costs; each still needs its own ledger and its own ruling.
- **It does not govern indirect effects.** A field consumed as *executable* input
  rather than as delete evidence is out of scope; ADR-0027 already forbids the
  one live instance (never execute manifest-stored argv).
- **It does not cover TOCTOU.** A field verified before a syscall can be
  invalidated between the check and the call. That is a separate residual, and it
  is declared where it occurs, following ADR-0028's *"not claimed as
  TOCTOU-free"* precedent.
- **It does not apply to non-manifest inputs.** The vault, transcripts and email
  are governed by ADR-0023, ADR-0032 and the secret-lifecycle ADRs.

## Relationship to the two specs drafted alongside it

**This ADR's signature does NOT gate `WP-managed-block-insertion-anchor` or
`WP-symlink-authorship-identity` — not their dispatch, not their
implementation, not their merge.**

The reasoning, recorded so nobody derives a phantom blocker from an unsigned
ADR sitting next to two `Ready` specs:

- Those specs were gated on **owner rulings over their cost ledgers**, and both
  rulings were given on 2026-08-02 (*"1) ship as specified 2) ship 4a+4b"*).
  Those rulings are transcribed in the specs and are what moved them to `Ready`.
- This ADR **codifies behavior those specs already measured and that `main`
  already ships**. It adds no requirement either spec does not already satisfy,
  and neither cites it as law — Part B's Implementation notes reference it as
  context for a decision made independently.
- Gating shipped, owner-ruled work on the signature of a document that describes
  it would invert the order: the practice is the evidence for the ADR, not the
  other way round.

What the signature *does* change: after it, this rule becomes citable as law for
**future** fields, and a new manifest field that widens deletion becomes a spec
defect rather than a judgement call.

## Consequences

- **Easier:** a new manifest field has one question to answer — *"what does this
  do when absent, malformed, and forged?"* — with a required answer for the last
  two. Reviewers get a single sentence to test against instead of re-deriving the
  posture per field.
- **Easier:** the two opposite type-gating decisions stop looking like an
  inconsistency and become a worked example, with the artifact-safety question
  that produces them stated once.
- **Harder:** every new field costs an exhaustive value-space check. Table S's
  twenty measured cells are the standard this sets, and that is more work than a
  type annotation.
- **Given up:** uninstall completeness, at the margin, permanently and by design.
  Each instance is a cost that must be measured and — where it is worse than the
  code it replaces — ruled on by the owner.
- **Not given up:** the reversibility contract. Corollary 1 is what keeps
  absence-of-field equal to previously-shipped behavior, so upgrades do not
  strand artifacts on installs that predate a field.
