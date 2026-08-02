# ADR-0038: A new manifest evidence field may only narrow a deletion, never widen one

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
> authority. Documents that cite it now cite it as a *proposal* — and no spec
> lists it in `adrs:` frontmatter, because that list means "law".
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
class of defect underneath it, each time in a field added for a good reason:

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

Each was fixed locally and each was rediscovered independently. The rule
underneath them has never been written down, so every new field re-derives it.

## Scope — what this ADR governs, and what it does not

The rule below is **not** a universal statement about every key in the manifest.
An earlier draft quantified over "every manifest field" and was falsified in
review by `target`; the scope is therefore stated first and precisely.

**The governed unit is an evidence-field GROUP, not a single key.** Fields that
are written and read together — `{sepBefore, sepAfter}`, `{origin, dev, ino}` —
are introduced by one change and decided by one predicate, so quantifying over
them one at a time is meaningless. The group is governed as a unit and the rule
quantifies over its **complete joint value space**.

**Governed: an evidence-field group added to a PRE-EXISTING entry kind.** Two
conditions, both required: the keys must carry *evidence* (their job is to let
the reverser decide whether an artifact is provably Wienerdog's), and the kind
must have existed, with a reverser, **before** the group was added — otherwise
there is no baseline to compare against. Each governed group is pinned to the
commit that introduced it:

| Group | Kind | Introduced by | Baseline = the reverser immediately before |
|---|---|---|---|
| `{target}` | `symlink` | WP-153, merged `78506dc` (PR #137) | `reverseSymlink` unlinked **any** symlink at a recorded path, with no ownership test |
| `{sepBefore, sepAfter}` | `managed-block` | WP-147, `ddd457f` (PR #134) | `reverseManagedBlock` stripped a fixed one newline on each side |
| `{anchorBefore}` *(proposed)* | `managed-block` | `WP-managed-block-insertion-anchor` | the reverser at `9188a1c` |
| `{origin, dev, ino}` *(proposed)* | `symlink` | `WP-symlink-authorship-identity` | the reverser at `9188a1c` |

**The baseline is never "the entry does not exist".** It is the reverser's
behavior for that kind with the group absent but the entry present. A no-entry
baseline would make every legitimate removal a widening and the rule vacuous.

**Not governed — dispatch and locator keys: `kind` and `path`.** They do not
*evidence* anything; they are what makes an entry an entry. `validateEntry`
rejects an entry lacking either, so there is no "absent" case and no baseline in
which the entry exists without them.

**Not governed — keys born WITH their entry kind.** They have no pre-field
reverser, so N and R are not evaluable for them at all. Verified with
`git log -S`, per kind, because "hash" is not one field:

| Key | Kind | Arrived | Evidence |
|---|---|---|---|
| `createdFile` | `managed-block` | with the kind | `87047a8` (WP-006, the Claude adapter) |
| `hash` | `file` | with the kind | `5cbcc9e` (WP-003, the installer core) |
| `hash` | `copied-skill` | with the kind | `980279e` (WP-050) |

*(`6bc8802`/WP-144 is where `hash:` enters `ENTRY_FIELD_TYPES` — that is the
type **gate**, not the field, and it does not make the field governed.)*

**`createdFile` is the sharpest reason the baseline must be the pre-field
reverser and not the absent case.** Read with the absent case as a proxy
baseline, **N is outright falsified** on it: absent ⇒ `ftruncateSync` +
`writeSync`, and the file survives (`manifest.js:317-321`); a forged
`createdFile: true` on an entry whose `remaining.trim() === ''` ⇒
`fs.rmSync(target)` (`:314-316`), and the file is gone. **An unlink is not a
subset of a truncate.** That is the same falsification `target` produced, on the
neighbouring key — which is why the reference point is stated three times in this
ADR and why `createdFile` is listed here rather than as an instance.

**Not governed prospectively — groups already shipped.** They are cited below as
**instances**, evidence that the rule describes real practice. They are not
re-opened by this ADR, and a signature does not license revisiting them.

## Decision

**For a governed evidence-field group `G` on a pre-existing entry kind `K`, let
the BASELINE be the reverser's behavior for `K` at the commit immediately before
`G` was introduced — the commit named in the scope table above. Then:**

- **N — the narrowing rule.** For **every point in the group's joint value
  space** — every combination of absent, well-formed, malformed and forged
  across all its keys — the set of filesystem mutations the reverser performs
  must be a **SUBSET of the mutations the baseline performs** on the same
  on-disk state. A group may make uninstall delete **less**. It may never make it
  delete **more**, or delete something the baseline would not have. *(Joint, not
  per-key: `WP-symlink-authorship-identity`'s Table S is the worked form —
  twenty cells covering `{origin, dev, ino}` exhaustively.)*
- **R — the reversibility floor.** When **every key in `G`** is **absent**, the reverser must
  reproduce the baseline **exactly**, not merely a subset of it. Absence is the
  permanent shape of every install written before `F` existed — nothing
  backfills — so a narrower-than-baseline absent case strands those installs'
  artifacts forever.
- **D — the disposal floor.** N alone does not pick a behavior: refusing an
  entry outright performs **zero** mutations and is trivially a subset, so it
  satisfies N for *any* group. Among the behaviors N permits, **never choose one
  that can leave an EMBEDDED artifact behind** (defined below). Where refusing
  would strand an embedded artifact, malformed input must degrade toward the
  baseline instead of refusing. **D is owner-buyable, on the same terms as R** —
  see "D's buy-out" below; it is never satisfied by silence.

**The reference point is the BASELINE, not the absent case.** That distinction is
the whole content of the correction below, and getting it backwards makes the
rule appear to forbid its own best instance.

### Why `target` looked like a counterexample and is not

Review raised `target` against an earlier draft that measured subsets against
*"the same field absent"*: a target-**less** symlink entry is always preserved,
while a target-**bearing** one can reach row 5 and unlink. Against that wrong
reference point, adding `target` widens.

Against the **baseline** — `reverseSymlink` as it stood before WP-153, which
unlinked **any** symlink at a recorded path with no ownership test at all — every
case is a subset:

| `target` | outcome | vs baseline |
|---|---|---|
| absent | preserve | strict subset |
| present, `sameResolvedDir` false | preserve | strict subset |
| present, resolves, `OWNED(L)` false | preserve | strict subset |
| present, resolves, `OWNED(L)` true | unlink | equal |

`target` satisfies **N**. It does **not** satisfy **R** — absent preserves where
the baseline deleted — and that departure is exactly the cost WP-153 put to the
owner and the owner ratified on 2026-08-01 (*"fine to have installs predating
the WP have uninstall leave all skill symlinks behind"*). **R is a default an
owner may buy out of with a ruling; N is not.**

### What D protects, defined — because "unremovable" is not the criterion

An earlier draft said D forbids leaving *"a Wienerdog-created artifact that no
future uninstall can remove"*. **That wording forbids D's own worked example**,
and review falsified it correctly: `uninstall` deletes the manifest as its last
step (`src/cli/uninstall.js`), so after a run **no** leftover is removable by a
future uninstall — a preserved symlink included. Worse, a later `sync` would see
that surviving link, classify it `origin: 'adopted'`, and row 4a would preserve
it again, permanently. Under the absolute wording, the symlink posture violates
D. The criterion has to be something else, and it is:

- **EMBEDDED artifact** — bytes Wienerdog wrote **inside a file the user owns and
  keeps editing**: the managed block in `CLAUDE.md` / `AGENTS.md`. Recovering
  from a leftover means the *user* opening their own document and working out
  which bytes were ours. The file is not ours to delete, and the boundary between
  our bytes and theirs is exactly the thing the sentinels exist to mark.
- **STANDALONE artifact** — a whole file, directory or link Wienerdog created:
  the skill symlinks, the core directory. Recovering from a leftover is one `rm`
  on a `wienerdog-*`-named path the user can see.

**D forbids leaving an embedded artifact. It permits leaving a standalone one.**
Both are equally unreachable by a future uninstall; they differ in what recovery
costs the user, and that is the whole content of the distinction.

**Stated plainly, because it is the honest half:** a standalone leftover really
is permanent as far as Wienerdog is concerned. That is not a gap this ADR papers
over — it is the failure mode WP-153's legacy arm already ships and the owner
already ratified on 2026-08-01.

#### D's buy-out

**R is owner-buyable and D is too, but only explicitly.** Buying out of D means
accepting that Wienerdog's bytes may remain **permanently inside a file the user
keeps**, with no path to removal except the user editing it by hand. That is an
owner-level cost in the same register as R's, and it must be **named in a cost
ledger and ruled on**, never inferred from a spec's silence. **No shipped or
proposed design invokes it**, and a design that needs to would be a spec defect
until the ruling exists.

### D in practice — the two opposite validation postures

D is what selects between behaviors N permits, and it produces **opposite**
type-gating decisions in the two specs drafted alongside this ADR:

| | `{kind:'managed-block'}` `anchorBefore` | `{kind:'symlink'}` `origin`/`dev`/`ino` |
|---|---|---|
| Listed in `ENTRY_FIELD_TYPES`? | **No** | **Yes** |
| A non-string value therefore… | reaches the reverser and degrades to the legacy strip | is rejected by `validateEntry`; `reverse()` skips the entry |
| …so the artifact is | **still removed** | **preserved** |
| Both satisfy **N**? | yes | yes |
| Artifact class | **EMBEDDED** | **STANDALONE** |
| **D** selects it because… | D **forbids** leaving an embedded artifact. Refusing would leave Wienerdog's block spliced inside a file the user keeps, recoverable only by the user hand-editing their own document — and an attacker could induce that permanently by corrupting one byte | D **permits** leaving a standalone artifact. Refusing leaves a `wienerdog-*` link the user can `rm`, which is the same failure mode the owner already ratified for legacy entries. **After the manifest is deleted it is permanent** — stated, not hidden |

**The question D asks is a property of the artifact, not of the group:** *is this
artifact EMBEDDED or STANDALONE?* Anyone applying this ADR to a new group must
classify the artifact before choosing a posture — and if the answer is
"embedded", refusing is not available without an owner ruling.

## Instances

**Six shipped, in `main` today:**

| Instance | Where | The narrowing |
|---|---|---|
| Schema validation | `validateEntry` + `reverse()`'s pre-dispatch skip | a malformed entry never reaches a reverser |
| Containment | `withinAllowedRoot` (WP-144) | an entry naming a path outside every Wienerdog-owned root is preserved |
| Separator vocabulary | WP-147's `SEP_BEFORE_OK` allowlist | anything outside `''`/`'\n'`/`'\n\n'` degrades to the legacy one-newline strip; the file-emptying primitive is gone. **A D instance**: it degrades rather than refuses, so the block still comes out |
| Legacy symlink entries | WP-153 Table A **row 2** | a target-less entry is preserved unconditionally. **The one owner-ratified departure from R** |
| Structural ownership | WP-153 Table A **row 4** | a forged `(path, target)` pair still has to name a `wienerdog-*` link directly under a harness skills root |
| Semantic-proof-only row 3 | PR #151 (`91b12e2`) | the recorded target can no longer authorize a delete `realpath` refuses. **The shipped code comment states the rule almost verbatim** (`src/core/manifest.js:186-193`): *"a recorded target may narrow this delete, never authorize one the semantic proof refuses"*, and *"Strictly narrowing: every input this now preserves was previously deleted"*. Its **commit message** carries the shorter form, quoted here exactly: *"Strictly narrowing: every input now preserved was previously deleted."* |

**Two PROPOSED designs, measured against this rule but NOT yet implemented.**
Their specs are `Ready`; **no `anchorBefore`, `insertionAnchor` or `linkIdentity`
exists in `src/` or `tests/` at this tip** — verified, not assumed:

| Design | Where | The narrowing, as measured in the spec |
|---|---|---|
| Insertion anchor | `WP-managed-block-insertion-anchor`, Table N | absent or non-hex ⇒ baseline; any other value withholds a strip. Measured over its whole value space against a prototype |
| Link identity | `WP-symlink-authorship-identity`, **Table S** | all twenty schema-accepted `{origin, dev, ino}` shapes measured end-to-end against a prototype: every one is `removed` at baseline, so **every preserved cell is a narrowing and no cell is a widening** |

Table S is the most complete evidence available for this rule — an exhaustive
measurement over one field group's entire accepted input space rather than an
argument — but it is evidence from a **prototype**, and this ADR says so.

## The non-provenance, recorded because it was wrong for months

**This rule is NOT in ADR-0019 and never was.** The sentence *"anything it
cannot prove it created is preserved"* was attributed to ADR-0019 across four
specs — **two `Done` specs at this tip (`WP-153`, `WP-147`'s family), plus
earlier revisions of the two drafted alongside this ADR, which now carry the
correction instead**. Counting it at the tip alone understates it; counting it
without that qualifier is unverifiable. Measured on 2026-08-02: the word *"prove"* appears **zero** times in
`docs/adr/0019-uninstall-disposes-core-mechanics.md`, and no ADR in `docs/adr/`
contains the phrase *"cannot prove"*. ADR-0019 is a **completeness-mandating**
ADR — it requires uninstall to remove the core's machine-generated mechanics, and
its **sole documented exception** is a user-modified `config.yaml`.

Two things follow, and both matter more than the correction:

- The rule was **load-bearing across four specs while existing nowhere**, which
  is the strongest available argument for writing it down.
- A misattributed citation is worse than a missing one, because it terminates
  inquiry. Anyone who checked would have found nothing; anyone who did not
  inherited a false certainty. **The `Done` specs carrying it are not edited** —
  they describe what they shipped — so this ADR is the correction's home.

## What this rule does NOT cover

- **Not manifest integrity.** An attacker who can rewrite the manifest can always
  *delete* a field and get the baseline. This rule bounds forged content; it does
  not authenticate the file. Signing/HMAC is a separate design, deliberately not
  built: the file has no integrity protection at all, and protecting one field
  while the rest is unprotected buys nothing.
- **Not completeness.** Narrowing costs completeness by construction — that is
  the trade, and it is why both 2026-08-02 rulings were owner decisions. This ADR
  does not pre-authorize future completeness costs; each needs its own ledger and
  its own ruling. **R** is the floor that keeps the cost from silently reaching
  pre-existing installs.
- **Not indirect effects.** A field consumed as *executable* input rather than as
  delete evidence is out of scope; ADR-0027 already forbids the live instance
  (never execute manifest-stored argv).
- **Not TOCTOU.** A field verified before a syscall can be invalidated between
  the check and the call — a separate residual, declared where it occurs,
  following ADR-0028's *"not claimed as TOCTOU-free"* precedent.
- **Not non-manifest inputs.** The vault, transcripts and email are governed by
  ADR-0023, ADR-0032 and the secret-lifecycle ADRs.

## Relationship to the two specs drafted alongside it

**This ADR's signature does NOT gate `WP-managed-block-insertion-anchor` or
`WP-symlink-authorship-identity` — not their dispatch, implementation or merge.**

The reasoning, restated after review removed an earlier circular version of it
(that draft argued the specs need no gate because the ADR describes behavior
`main` already ships — which is false for precisely those two, since their
implementations do not exist yet):

- **What actually gated them has been satisfied.** Both were gated on **owner
  rulings over their cost ledgers**, and both rulings were given on 2026-08-02
  (*"1) ship as specified 2) ship 4a+4b"*). Those rulings are transcribed in the
  specs and are what moved them to `Ready`. Nothing else was ever their gate.
- **Neither spec depends on this ADR to be correct.** Each derives its narrowing
  property independently and *measures* it — Part B exhaustively, over twenty
  cells. Remove this ADR and neither spec loses a claim; the ADR's value is that
  the **next** field does not have to re-derive it.
- **Neither cites it as law.** Both reference it in prose as context, and
  **neither lists it in `adrs:` frontmatter** — that list means "implementers
  treat this as law", which an unsigned Proposed ADR is not.
- **Gating them would invent a blocker the owner did not create.** He ruled the
  work in and authorized the ADR as a third, separate item. Reading his
  authorization to draft as a precondition on the work he just approved inverts
  his instruction.

What the signature *does* change: this rule becomes citable as law for **future**
fields, the two designs above graduate from "measured against a proposal" to
"instances of a ratified rule" when they ship, and a new manifest field that
widens deletion becomes a spec defect rather than a judgement call.

## Consequences

- **Easier:** a new evidence field has one question to answer — *"what does this
  do when absent, malformed, and forged, measured against the pre-field
  baseline?"* — with a required answer for all three.
- **Easier:** the two opposite type-gating decisions stop looking like an
  inconsistency and become a worked example of **D**, with the artifact question
  that produces them stated once.
- **Harder:** every new field costs an exhaustive value-space check. Table S's
  twenty measured cells are the standard this sets, and that is more work than a
  type annotation.
- **Given up:** uninstall completeness, at the margin, by design. Each instance
  is a cost that must be measured and — where it is worse than the code it
  replaces — ruled on by the owner.
- **Not given up:** the reversibility contract, which is **R**'s whole job.
  Departures from R exist (WP-153 row 2) but are owner-ratified, one at a time,
  never assumed.
