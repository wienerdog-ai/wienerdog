# ADR-0034: The secret fence's threat model is accidental persistence, not deliberate exfiltration

Status: Accepted
Date: 2026-07-25

OWNER-SIGNED 2026-07-25

> **OWNER-RATIFIED IN SESSION — 2026-07-25 (TRANSCRIBED, NOT OWNER-TYPED).**
> Gyula Fehér ratified this in conversation; this line was written by the
> orchestrator, not by him. It records that the decision was taken — it is
> **not** his signature and must never be treated as one. The merge gate keys on an
> owner-written signature line, which no agent ever writes.

## What this ADR supersedes and re-ratifies

**Supersedes, narrowly:** ADR-0024's WP-123 EP2 amendment and ADR-0024's
rejection of high-entropy-as-`redact`, **for the context-free case only** (see
Decision 6). ADR-0024's WP-125 EP4 amendment is **unchanged**, and everything
else in ADR-0024 stands.

**Lifts and re-ratifies:** the permanent shape-allowlist ban first written in
ADR-0033 (Decision 7). ADR-0033 was never ratified and is superseded by this
ADR; the ban is its only durable content and survives here verbatim.

## Context

ADR-0024 built a fail-closed secret lifecycle: one shared detector
(`src/core/secret-scan.js`), four independent persistence gates. Behind
eighteen precise labelled rules sits **one context-free high-entropy pass** — a
run of 24+ characters from `[A-Za-z0-9+/=]` at ≥ 3.5 bits/char is
`high-entropy` at `quarantine` severity. Under the WP-123 amendment, **any**
finding at the EP2 staged-output gate withholds and reverts the whole note.

**That rule is destroying the product, and the measurement is not marginal.**
Scanned on 2026-07-28 against the maintainer's real vault (189 markdown notes),
with the detector as it stood *before* this fence's first leg: **109 notes
(57.7%) contain at least one finding and would be reverted by EP2.** On
2026-07-24 the live dream
reverted three legitimate notes — including the daily rollup — and, because the
transcript ledger had already marked those sessions processed, that content was
lost permanently. (The ledger half was fixed separately by
`WP-secret-revert-defers-ledger`; the over-firing was not.)

The predecessor work package `WP-secret-fence-shape-and-context` attacked the
over-firing directly and ran **six adversarial review rounds, producing a
fail-open critical in five consecutive ones**. Each fix relocated the hole
rather than closing it. The reason is not that its rules were bad. **Every
round was implicitly judged by "can you construct a string that slips
through?", and that criterion has exactly one fixed point — quarantine
everything that looks random — because a 44-character random API key and a
44-character random Google Drive file id are byte-distribution identical. No
algorithm separates them.** The loop could only converge on today's behaviour,
which is measurably unusable.

What was missing was never a cleverer regex. It was a **ratified threat
model**: a written statement of what the fence is for, so that a review has a
fixed criterion instead of an unbounded counterexample game, and so that the
next session does not re-litigate it from scratch. This ADR is that statement.

**IRON RULE (ADR-0004): Wienerdog is just files.** This ADR starts no process,
opens no socket, and sends nothing off the machine. Decision 5 below makes that
constraint permanent for this problem domain.

## Decision

### 1. IN SCOPE: accidental credential persistence

The threat the secret fence exists to stop is: **the user pasted a credential
into an AI session, and the dream must not copy it verbatim into plaintext
markdown in a git-tracked vault.** The credential arrives in whatever shape its
provider issues, in whatever context a chat log or a `tool_result` puts it in.
Nobody is trying to hide it.

### 2. OUT OF SCOPE: deliberate adversarial exfiltration

An attacker who *wants* a credential in the vault — for example via prompt
injection in a transcript — encodes it trivially: split across two sentences in
12-character pieces, spelled word by word, reversed, base32'd, wrapped in a
benign-looking URL. **On a free-text LLM-authored channel the number of covert
channels is unbounded, so no content filter can stop deliberate exfiltration.**
Today's maximally strict filter does not stop it either; tightening only taxes
the honest path.

Containment of a missed secret is **ADR-0025** (hermetic runtime profiles — the
dream brain has no network and no Bash) and **ADR-0026** (the GWS capability
broker — the model cannot self-authorize an external send). It is not this
scanner's job and never was. ADR-0024 already said so in its "Boundary
statement (the A5 residual)"; this ADR promotes that sentence from a caveat to
the governing criterion.

### 3. Format plus context detection is sufficient for the in-scope threat

Real credentials have formats. Providers added prefixes (`sk-ant-`, `ghp_`,
`AKIA`, `GOCSPX-`, `glpat-`, `npm_`) **precisely so that scanners can find
them**. That is the design point the industry converged on and it is what
gitleaks' 222-rule default config is built out of. For the accidental case,
labelled format rules plus a context-bound entropy rule are the right
instrument, and a context-free entropy rule is the wrong one — measured, it
contributes **100% of the destructive false positives** (Evidence E1) and
nothing else.

### 4. A credential that happens to look like a path or a document id is adversarial input by definition

Therefore it is out of scope by Decision 2, **therefore it is not a valid
objection to a rule.** This is the specific move that consumed six review
rounds, and it is now settled: a counterexample string that a human
deliberately shaped to evade a rule is not a finding against that rule.

The ratified review criterion follows. A finding against any work package
implementing this fence must be one of:

- **(a)** a real, named, published credential format that the change stops
  catching relative to the shipped detector;
- **(b)** a false-positive class measured on real user prose;
- **(c)** a defect in the code, the contracts, or the verification as
  specified.

Anything else is reported as an observation, not as a blocking finding.

### 5. Live verification is permanently out of scope

trufflehog-style verification — calling the provider to check whether a
candidate key is real — would mean sending key-suspicious material to the
network **from a job whose entire security argument is that it has no
network** (ADR-0025). It is its own risk class and it violates ADR-0004's
just-files, no-network invariant. Do not propose it, in any form, including an
"offline-only, opt-in" variant: the moment the code path exists it is one flag
away from running in the dream.

### 6. What this supersedes in ADR-0024, and exactly how far

Two dated statements in ADR-0024 are overridden, **for the context-free
high-entropy case only**:

- **ADR-0024 §2, enforcement point 2, the WP-123 amendment** — cited by its
  dated marker: *"(Amended, OWNER-APPROVED 2026-07-17, WP-123 spec-gap
  walkthrough: this gate reverts on ANY detector finding — both `redact` and
  `quarantine` severities, condition `findings.length > 0` — not only a hard
  finding.)"*
- **ADR-0024 "Alternatives considered", final bullet** — ratified under that
  ADR's dated header block *"OWNER-APPROVED (2026-07-17)"*: *"**Treat
  high-entropy hits as `redact` (inline) rather than `quarantine`.** Rejected:
  an unstructured high-entropy blob has no safe partial form — redacting 'the
  secret part' is undefined, so the whole artifact must be withheld/reverted."*

**The narrow override.** A high-entropy candidate with **no bound sensitive
keyword** is `redact` severity, and EP2 responds to a findings set containing
no `quarantine` finding by preserving an unredacted copy into
`state/quarantine/redacted/` **first** and then scrubbing exactly the lines
that run added, leaving the note in the vault. Everything else keeps ADR-0024's
behaviour: a high-entropy candidate **with** bound sensitive-keyword context is
`quarantine`, every labelled rule is `quarantine`, and any `quarantine` finding
still withholds and reverts the whole note.

**Why the 2026-07-17 rejection no longer holds, on its own terms.** Its
premise was that a high-entropy blob "has no safe partial form." That premise
is now false in two ways, both of which ADR-0024 could not have known:
(i) the partial form **is** defined — the unit replaced is a maximal
delimiter-free run inside the candidate, not a guessed substring; and (ii) the
rewrite is **reversible**, because the pre-scrub bytes are preserved verbatim
under `state/quarantine/` before a single byte is rewritten, so a false
positive costs a lookup rather than a mangled note. ADR-0024's real objection
was to *silent, unrecoverable* mutation of the user's own writing, and that
objection is honoured: the redaction is preserved, reported in the dream
report, and reversible.

**Unchanged, explicitly:**

- **ADR-0024 §2, enforcement point 4, the WP-125 EP4 amendment** *"(Amended,
  OWNER-APPROVED 2026-07-17, WP-125 spec-gap walkthrough: this gate omits a
  section on ANY detector finding … EP4 consumes the `scanAndRedact` `findings`
  array directly and keys on `findings.length > 0`.)"* **EP4 still omits a
  digest section on any finding of either severity.** Its input is a
  human-authored approved identity note, not brain output; the availability
  trade-off ADR-0024 accepted there is unaffected by this ADR.
- EP1, EP3 and EP4 keep their code, their call sites and the detector's
  signatures. **Their output is not unchanged, and this ADR does not claim it
  is** (corrected 2026-07-26, errata ER-3). `redactOnly(t)` is by definition
  `scanAndRedact(t).text`, and the context-free tier replaces fewer runs than
  today's, so EP1 and EP3 redact strictly less; EP4 keys on
  `findings.length > 0` and therefore omits strictly fewer digest sections. Both
  loosenings follow directly from Decision 6 and are intended: what they remove
  is redaction of material Decision 3 says was never credential-shaped. The
  implementing work package asserts them rather than assuming them.
- ADR-0024's one-shared-detector rule, its four-independent-gates structure,
  its metadata-only findings contract, its fail-closed totality requirement,
  and its boundary statement.

The **exact** EP2 disposition contract — dispositions, artifact placement,
counters, retention, and user-facing surfaces — is not restated here. It lives
in one canonical table, per ADR-0031: Table B of
`WP-secret-fence-ep2-redact-arm`. The two sentences above state the durable
principle; that table decides the details, and this ADR defers to it.

### 7. Shape allowlists are permanently rejected, in every form

Lifted **verbatim** from ADR-0033 (which was never ratified and is superseded
by this ADR; this ban was its only durable content), and ratified here under
this ADR's approval line:

> **A shape allowlist (`1` + 43 base64url characters).** Rejected
> **permanently** (owner direction, 2026-07-25): ~1 in 64 uniformly random
> 44-character base64url credentials start with `1`, so the rule is a standing
> fail-open hole with no human in the loop. Do not re-propose it in any form —
> a length rule, a prefix rule, a character-class rule and a "provider-shaped
> id" rule are the same rejected thing.

**Where the line falls, so this ban is applicable rather than merely
emphatic.** A *suppressor keyed on the candidate's own characters* is banned. A
rule that changes the **unit of measurement** (what counts as one candidate
run) or that anchors on the **surrounding structure** (a keyword and a
separator in the text around the candidate) is not a shape allowlist: it
suppresses nothing, names no token as safe, and is symmetric with respect to
the candidate's contents.

## The measured evidence

E1–E3 were re-measured on **2026-07-28** against the maintainer's real vault
(**189** markdown notes under `~/Obsidian/gyula`, excluding
`.git`/`.obsidian`/`.trash`); the vault is private and is not checked in. E4 was
produced on 2026-07-25 against commit `efd1489`. The vault is a live corpus — see
errata ER-4 and ER-7 for what that means for a later reproduction.

**What each figure is measured against, stated because leg 1 has now merged and
the two halves no longer come from one detector.** E1 and E2 describe the
detector as it stood *before* `WP-secret-fence-two-tier-detector`, reproduced by
`scripts/measure-secret-fp.js` at `72f3e46`: that script runs the module's
labelled stage with its entropy stage suppressed, then applies a hand-written
copy of the pre-leg-1 context-free pass to what survives, and it refuses to print
any figure at all on a corpus where a rule leg 1 *added* has matched. E3 describes
this design's end state and is now measured against the **shipped, merged
detector** rather than against the from-spec prototype it rested on when it was
first written — a strengthening of E3's evidence, not a change to what it claims.

**E1 — the destructive false positives come from exactly one rule.**

```text
notes scanned                                     189
notes with ANY finding (EP2 reverts today)        109   (57.7%)
    high-entropy ONLY                             108
    a labelled rule ONLY                            0
    both                                            1   (a documented AKIA placeholder)
findings by rule:  high-entropy 315 occurrences  |  aws-key 1
distinct high-entropy runs                        110
```

**100% of the destructive false positives come from the single context-free
entropy rule.** Of the eighteen labelled rules, exactly **one** — `aws-key` —
produced a finding in the entire corpus, and that finding is a documented
`AKIA…` placeholder in a security note, a true positive by shape; **the other
seventeen produced none.** (Corrected 2026-07-26, errata ER-6: the original
sentence put the count on the wrong side.)

**E2 — the 7-character structural void.** Of the 110 distinct high-entropy
runs, **106 contain a `/`**, and every one of those is a file path or a
slash-joined prose list. The discriminating fact: **the longest slash-free
segment in any of them is 17 characters, against a 24-character floor — a
7-character structural void.** A credential is high-entropy *within* one
delimiter-free segment; a path is high-entropy only *across* its segments.
That gap is structural, not a tuned threshold: it exists because path segments
are words. (Distribution of the longest segment per run: 7→3, 8→9, 9→25,
10→28, 11→3, 12→29, 13→4, 14→4, 17→1.)

**E3 — the design's measured end state.** Labelled rules at `quarantine` plus a
context-bound tier and a context-free tier: notes withheld **109 → 1** (the
pre-existing `AKIA` placeholder, a labelled-rule hit unaffected by any of
this), notes scrubbed in place **0 → 9**, notes untouched **80 → 179**.

**E4 — the false-negative cost, measured rather than argued.** *(Corrected
2026-07-26, errata ER-1 and ER-2. The original text stated a cell count that its
own fixture table could not produce, and claimed a single regressing class on a
corpus that contained only one published slash-bearing format.)*

Credential fixtures derived from the gitleaks default ruleset × 4 contexts,
N = 2 000 draws per cell, comparing the shipped detector against the proposed
one. **The corpus size, the cell count, the exact set of regressing cells and
their measured rates are decided in one canonical place — Table C3 of
`WP-secret-fence-two-tier-detector`, rows C3-0, C3-2 and C3-3 — and are
deliberately not restated here.** Restating them is how the original figures
drifted from the table they were supposed to summarize.

What this ADR does state, because it is the durable shape of the trade rather
than a number:

- **The regression is confined to one structural cause**: a credential whose
  entropy-visible tail is drawn from an alphabet containing `/`, and only when
  it appears with no bound sensitive keyword. Every such format in the corpus is
  marked as such in Table C1.
- **It never occurs in `assign` context** — a sensitive-key assignment binds the
  context-bound tier or matches a labelled rule, and stays at 100% at
  `quarantine` severity. That is the shape these credentials actually arrive in.
- **It scales as 1/length**, so it is worst at each format's published minimum
  length and negligible for the long-bodied formats.
- **The affected formats are exactly those with no Wienerdog labelled prefix
  rule.** A purely additive follow-on that adds those prefixes closes the
  residual without touching this decision — which is the same follow-on the
  Boundary statement's item 2 already argues for.

The trade this ADR ratifies is unchanged by the correction: E1's measured
destructive false-positive rate on a real vault, against a single-digit to
low-double-digit synthetic false-negative rate on bare pastes of a handful of
formats, in the one context those formats are least likely to appear in.

## Boundary statement (the residual, stated not buried)

**A scanner is never the external-effect boundary** — ADR-0024's residual is
unchanged and is not weakened by this ADR. What this ADR adds is the honest
accounting of the *other* side of the trade:

1. **A bare-pasted credential whose `/` characters fragment it below the floor,
   with no bound sensitive keyword nearby, is missed** — the AWS
   secret-access-key shape and every other published format whose tail alphabet
   contains `/` and which has no Wienerdog labelled prefix rule (E4; per-format
   rates in Table C3 row C3-3). Accepted: the assignment and `.env` shapes such a
   key actually arrives in are caught at 100% at `quarantine` severity, and
   gitleaks — the reference implementation — has no rule for the prefix-free AWS
   class at all. This is parity with the state of the art, not a
   Wienerdog-specific gap. *(Widened 2026-07-26, errata ER-2: the original text
   named only the AWS shape.)*
2. **Most covered provider formats have no labelled rule** and are caught only
   by the entropy pass. The exact set is the `labelled? = no` column of Table C1
   in `WP-secret-fence-two-tier-detector`; this ADR deliberately states no count,
   because the original "fifteen" here and in the work package drifted apart
   (errata ER-2's underlying defect). Pre-existing, unchanged by this decision,
   and the strongest argument for a cheap, purely additive follow-on that adds
   the missing prefixes — starting with the slash-bearing ones, which close
   residual 1 as a side effect.
3. **A context-free high-entropy hit is now scrubbed and committed rather than
   withheld.** If it was a real credential, its `[REDACTED:high-entropy]`
   replacement is committed in its place and the raw bytes sit in
   `state/quarantine/redacted/` (local-only, `0600` inside `0700`, never
   synced, removed by `wienerdog uninstall` per ADR-0019) rather than in vault
   git history. That is a strictly better outcome for the true positive **and**
   for the false positive; what is given up is the loud stop.

Like ADR-0024, this is not an OS security boundary. Same-UID native code reads
the `0600` artifacts regardless (`docs/THREAT-MODEL.md` T0 / ACTION-LIST A12).

## Consequences

- **Reviews of the secret fence now have a fixed criterion.** Decision 4's
  (a)/(b)/(c) taxonomy replaces the unbounded counterexample game that produced
  five consecutive fail-open criticals against one work package. A reviewer who
  constructs an evasion string is producing an observation, not a blocker.
- **The severity taxonomy acquires meaning at EP2.** `redact` gains exactly one
  producer and a gate that acts on it; before this ADR, `redact` and
  `quarantine` were indistinguishable at that gate.
- **A false positive stops costing the user a note.** Measured: 109 withheld
  notes become 1 withheld and 9 scrubbed-with-a-preserved-original.
- **The fence is now allowed to be wrong in one direction on purpose.** That is
  the point of writing the threat model down: the residual in E4 and the
  Boundary statement is a decision, not an oversight, and a future round that
  "discovers" it is rediscovering a ratified trade-off.
- **Anything the fence gives up is contained elsewhere or not at all.** ADR-0025
  and ADR-0026 are load-bearing for this decision; weakening either re-opens
  this ADR.
- **ADR-0033 is disposed of.** Its exact-value allowlist design is not built;
  its shape-allowlist ban lives here.

## Alternatives considered

- **Keep today's behaviour (withhold on any finding).** Rejected on
  measurement: 57.7% of a real vault reverted, permanent content loss already
  incurred, and the destructive share attributable to one rule is 100%. A
  security control the user must route around is not a security control.
- **A human-ratified exact-value allowlist** (sha256 digests of approved whole
  spans; ADR-0033, `WP-secret-scan-whole-token-runs`,
  `WP-secret-allowlist-exact-value-store`, `WP-quarantine-review-cli`).
  Rejected, and the whole chain superseded: measured against this vault it
  would have required **~118 manual approvals up front, 97% of them file
  paths**, growing with every new project folder. An allowlist whose size grows
  with the corpus is not a filter, it is a to-do list. The design was sound; the
  problem it solved was the wrong problem, because the false positives are a
  rule defect, not a set of individually blessable values.
- **A shape allowlist.** Rejected permanently — Decision 7, verbatim.
- **URL-slot-anchored Drive-id suppression.** Measured and rejected: **0 of 8**
  real occurrences in the vault sit in a URL slot (all eight are bare backticked
  ids in prose), while an adversary planting a secret *inside* the allowed slot
  would be detected 0.00% of the time (N = 20 000). Zero benefit, real cost.
- **A flat "drop `/` from the entropy alphabet".** Rejected: an AWS secret
  access key is exactly 40 characters of standard base64 including `+` and `/`,
  and slashes would fragment it below the floor **14.46%** of the time (N =
  200 000). This is why the alphabet is tiered rather than narrowed.
- **A proximity-based context predicate** (a sensitive keyword within N
  characters). Rejected: measured on the real vault it still quarantines 1–4
  legitimate notes at every window from 24 to 64 characters, and a window small
  enough to reach zero does so by a one-character margin on a single corpus —
  the "tuned to one sample" trap that produced the predecessor's defects. A
  separator-bound predicate has a structural reason to hold instead of a
  numeric one: English prose does not put a `:` or `=` between a noun and a
  path.
- **trufflehog-style live verification.** Rejected permanently — Decision 5.
- **Statistical "text-likeness" discrimination** (bigram models separating
  prose-like from random strings). Measured by the predecessor and rejected:
  11–41 false positives out of 178 notes against a 3/178 target.
- **Leaving the threat model in the work package instead of an ADR.** Rejected:
  it lived there for six rounds and was re-litigated in every one. A criterion
  that only one document knows is not a criterion.

## Appendix — the amendment record (nothing below this line is a Decision)

**Everything below this heading is bookkeeping about how this document was
changed. Nothing below it decides anything.** The ratified content of this ADR —
what it supersedes, its Context, Decisions 1–7, the measured evidence, the
Boundary statement, the Consequences and the Alternatives considered — is
everything *above* this heading, and it ends here.

**Why the bookkeeping is at the back, moved here 2026-07-26 in round 5 and
disclosed in the round-5 structural-correction block at the end of this
appendix.** Amendments accumulate; ratified content does not. Measured on the
round-4 file as round 5 found it: 690 lines, of which the eight meta blocks were
lines **14–316** — errata, cross-reference records, the amendment licence, the
status note and two structural corrections — putting
`## What this ADR supersedes and re-ratifies` at line 317, `## Context` at 328 and
`## Decision` at 366. **45.8% of the file preceded its first ratified heading**, a
share that grew with every review round. A
reader arriving to find out what was decided met four rounds of self-audit first,
and each new round pushed the Decisions further down. The blocks are unchanged in
content and unchanged in their order relative to each other; only their position
in the file moved, so every "below" and "immediately below" in them still points
where it did.

**This appendix is where every future amendment goes**, in the same form: a dated
`##` block that states what moved, quotes the pre-edit bytes verbatim, and names
the digests it obliges the architect to recompute.

## Errata — 2026-07-26 (evidence corrections; no Decision changes)

This ADR was ratified on 2026-07-25. The adversarial review of the implementing
work package, run the same week, found that three statements of **measured
evidence** in this document were wrong. They are corrected in place, below, and
the corrections are logged here so an auditor can see exactly what moved.

**Why an errata amendment rather than a new ADR, and rather than a spec-side-only
fix.** The corrections are to *evidence* — E4's arithmetic, E4's claim that one
class regresses, and the "EP1 and EP3 are byte-unaffected" line — not to any
Decision. Decisions 1–7 are unchanged and re-derive identically from the
corrected figures: a larger measured false-negative residual is exactly the trade
Decision 3 and the Boundary statement already ratified, and none of the
corrections touches what the fence is *for*. A new ADR would imply the decision
moved; it did not. Equally, correcting these only in the work package was
rejected: the spec's copy would become the primary record while the durable one
kept stating a false figure, which is the mirror-promotion failure ADR-0031
exists to prevent. **The `OWNER-SIGNED` line and Decisions 1–7 are untouched by
this amendment**, and no agent may ever amend either — with the single narrow
exception defined under "The five-condition precedent for repairing a dangling
cross-reference inside a Decision", below, and nowhere else.

| # | What was wrong | Where | Correction |
|---|----------------|-------|------------|
| ER-1 | "32 credential fixtures … = **128 cells**" — the fixture table it counted declared 33 ids in 32 rows, so the product was unachievable without silently dropping one | E4 | E4 no longer carries the arithmetic. Corpus sizes and cell counts are decided in **Table C3 row C3-0** of `WP-secret-fence-two-tier-detector` and stated nowhere else |
| ER-2 | "**126 of 128** cells are byte-identical. **Exactly one class regresses**" — both wrong on their own figures (a 2-fixture × 2-context regression is 4 cells, not 2) and wrong on the facts (the fixture corpus omitted every published slash-bearing format except AWS) | E4 | The corpus was extended with the slash-bearing published formats that had no Wienerdog labelled rule. The regression set is larger and is enumerated with per-format measured rates in **Table C3 row C3-3** of `WP-secret-fence-two-tier-detector`. E4 now states the *shape* of the residual and defers the numbers |
| ER-3 | "EP1 and EP3 (`redactOnly`) ignore severity and are **byte-unaffected**" — false. `redactOnly(t) === scanAndRedact(t).text`, and the change replaces fewer runs, so the *text* changes wherever a context-free candidate is no longer replaced. EP4, which keys on `findings.length > 0`, likewise sees fewer findings | "Unchanged, explicitly", third bullet | Corrected to say what is actually unchanged (the signatures, and the fact that no EP1/EP3/EP4 call site is edited) and to state the loosening plainly |

Nothing else in this ADR is amended.

## Errata — 2026-07-26, round 3 (vault re-measurement and one arithmetic correction; no Decision changes)

The third adversarial review round reproduced this ADR's evidence against the
live vault and found two kinds of divergence: the corpus had **grown by one note**
since the 2026-07-25 measurement, and one sentence of commentary on E1 had never
been arithmetically right. Both are corrected in place below.

**Why an errata amendment again rather than a spec-side fix.** Same reason as
above: the work package mirrors E1 and E3 and its verification step V-15 pins
both copies by literal grep, so correcting only the spec would promote the spec's
copy to primary and leave this record stating a superseded figure. **The
`OWNER-SIGNED` line and Decisions 1–7 are untouched by this amendment**, and no
agent may ever amend either — with the single narrow exception defined under
"The five-condition precedent for repairing a dangling cross-reference inside a
Decision", below, and nowhere else. Nothing here changes what was decided: a
one-note-larger corpus moves a percentage by four tenths of a point and moves no
argument at all.

| # | What was wrong | Where | Correction |
|---|----------------|-------|------------|
| ER-4 | the corpus is **live**, and E1 stated a dated snapshot as if it were stable: 181 notes measured 2026-07-25, against 182 on 2026-07-26 | E1, the Context paragraph, the evidence header, and the first "Alternatives considered" bullet | Re-measured 2026-07-26 against the shipped detector at `efd1489`: **182** notes scanned, **102** with any finding, **56.0%**. Every structural fact is unchanged — the finding count, the 101/0/1 split, the 299 `high-entropy` occurrences, the single `aws-key` hit, the 106 distinct runs — and **E2 reproduces byte-identically**, including its longest-segment distribution. Figures now carry their measurement date; a later divergence caused by further vault growth is a re-measurement event handled by this same mechanism, not a defect |
| ER-5 | "notes untouched **79 → 171**" — the same one-note drift | E3 | **80 → 172**. The withheld (102 → 1) and scrubbed (0 → 9) rows are unchanged |
| ER-6 | "The other seventeen labelled rules produced **one** finding in the entire corpus, and that one is a documented `AKIA…` placeholder" — arithmetically wrong on its own figures. There are **eighteen** labelled rules; **one** of them (`aws-key`) produced the single finding, so *the other seventeen produced none* | E1's commentary | Restated so that the rule that fired and the rules that did not are on the correct side of the count |

Nothing else in this ADR is amended by round 3.

## Cross-reference update — 2026-07-26 (spec split; no Decision changes, no evidence changes)

The work package this ADR points at, `WP-secret-fence-two-tier-entropy`, was
split in two on 2026-07-26 by owner authorisation, along the Table A / Table B
line it had already drawn. Nothing in this ADR was decided, un-decided or
re-measured by that split; the only edits were the document names in the
cross-references below, which would otherwise dangle.

| this ADR cites | now lives in |
|----------------|--------------|
| **Table A** (what the detector emits) and **Tables C / C1 / C3** (the corpora and the acceptance numbers) — cited by ER-1, ER-2, E4 and Boundary-statement items 1 and 2 | `docs/specs/WP-secret-fence-two-tier-detector.md` (a new file) |
| **Table B** (the EP2 disposition contract) — cited by the closing paragraph of Decision 6 | `docs/specs/WP-secret-fence-ep2-redact-arm.md`, which is the original file, renamed |

**Decision 6's closing paragraph carries one of those pointers**, so this edit
touches a line inside a Decision section. To be exact about what did and did not
change: the sentence still says what it always said — that the exact EP2
disposition contract is not restated in this ADR and lives in one canonical table
elsewhere — and only the file name after "Table B of" was updated.
**Decisions 1–7 and the `OWNER-SIGNED` line are untouched**, as the errata block
above requires, and no agent may ever amend either — **with exactly one narrow
exception, defined immediately below and nowhere else**: the architect may
repair a *dangling cross-reference* inside a Decision's prose, which changes no
meaning and is precisely what this block did. Read the two statements together
rather than as a contradiction: "no agent may amend a Decision" is about what a
Decision **asserts**; the exception is about a **pointer inside it that no longer
resolves**. Nobody — architect included — may touch the `OWNER-SIGNED` line or a
Decision's substance, and an implementer may not edit this file at all.

## The five-condition precedent for repairing a dangling cross-reference inside a Decision

**The precedent this sets, named rather than left to be inherited (added
2026-07-26, round 3; tightened 2026-07-26 in the round-3 revision; given its own
heading and its own digest 2026-07-26, round 4).** "Accepted,
therefore immutable" and "a file this ADR cites was renamed" are in genuine
tension, and this block resolved it by editing inside a Decision. That
resolution is now a rule with **five** conditions, all of which must hold
together:

1. the edit repairs a **dangling cross-reference** — a document name or a path
   this ADR cites that no longer resolves — and nothing else. **A contract-table
   row id belonging to another document is explicitly NOT covered.** Repointing,
   say, "Table B rows B4/B5/B10" at renumbered rows changes *which contract the
   Decision governs* while reading exactly like a typo repair, and no later
   reader can tell the two apart. Only the **document name** in such a citation
   may be repaired; the row ids inside it may not, and a row-id repoint is a
   new-ADR event;
2. it changes **no meaning**: the sentence must still assert exactly what it
   asserted before, and the block must state what did and did not move, as the
   paragraph above does. **The disclosure must quote the pre-edit text
   verbatim** — the whole sentence as it stood, not a paraphrase of it. Nothing
   else makes "no meaning changed" falsifiable once the old bytes are gone;
3. it is **dated and disclosed here**, in the errata/cross-reference section,
   never silently in place;
4. it never touches the **`OWNER-SIGNED` line**, and it never adds, removes or
   re-scopes a Decision;
5. it is performed by **the architect, and by nobody else** — never an
   implementer. An implementer's work package puts `docs/adr/*` outside its
   Deliverables table, so a red gate traceable to this file is a
   stop-and-report, never a repair. This condition is what makes the exception
   above safe to state at all.

Anything that fails one of the five is a **new-ADR event**, not an edit. In
particular this precedent does **not** license correcting a Decision's reasoning,
tightening its wording, or updating a figure inside it — the errata mechanism
above covers measured evidence only, and the Decisions are outside it.

**How this is enforced rather than merely asserted (added 2026-07-26, round-3
revision; extended 2026-07-26, round 4).** Verification step **V-21** of
`WP-secret-fence-two-tier-detector`
takes a sha256 digest over this file's `## Decision` … `## The measured evidence`
range and compares it against a literal recorded in that spec. Until round 3
nothing anywhere checked this file's Decisions: that spec's V-11 pins the status
line and the signature, V-15 pins the evidence, and V-18 checksums the *spec's*
inline copy of Decisions 1–5 — so an edit to a Decision **here** was invisible to
every gate, while this very block licenses one class of such edit. The digest
closes that gap.

**Round 4 extended V-21 over this section too, and the reason is this section's
own argument turned on itself.** The licence above — the five conditions, and in
particular condition 5, "performed by the architect, and by nobody else" — lived
**outside** every digest: the Decision digest starts at `## Decision`, and the
errata-row digest matches only lines beginning `| ER-`. Deleting "the architect,
and by nobody else" would have silently widened the exception to every agent,
and nothing would have gone red. That spec's own sentence about V-21 applies
here: *a licensed exception with no gate is an unlicensed one in practice.*
V-21 therefore now carries a **second** digest, over this heading through the
line before the **next `##` heading**, whatever that heading happens to be — i.e.
the whole precedent, its five conditions, this enforcement paragraph and the
signature note that closes the section. Editing any of it is now an architect act
with a disclosed recomputation, exactly like editing a Decision.

**The terminator is "the next `##` heading" rather than a named one, and round 5
changed it for a measured reason** (disclosed in the round-5 structural
correction below). Round 4 terminated the range at `## Not yet committed` — a
status note whose own stated premise expires on the commit that this ADR's
implementing work package requires before it can be dispatched at all. Measured
2026-07-26 on the round-4 layout this repair was raised against: delete that
section and the range runs **82 → 567 lines**, swallowing Context, all seven
Decisions, the measured evidence, the Boundary statement, Consequences and
Alternatives. On the post-move layout the same deletion runs it **100 → 338
lines** — smaller, because the Decisions now sit above this appendix, and still a
*licence* digest turned into a *whole-appendix* one. The gate reddens rather than
failing open, but for the wrong reason — and the instructed repair, "recompute
the literal", would silently convert one into the other, whereupon it reddens on
every unrelated dated block. A next-`##` terminator cannot be deleted, because it
is whatever comes next; measured on this file it selected the **same 82 lines and
produced the same digest** as the old form at the moment it was introduced, so
the change is a hardening and not a re-scoping. V-21's probe was extended in the
same pass to assert the range contains **exactly one `##` heading**, so a range
that has swollen past its own section fails loudly instead of being repinned.
(That count is the strict form of "the range must not contain `## Decision`",
which round 5 asked for and which alone would be vacuous here: after the move a
range swollen to end-of-file contains five `##` headings and no Decision.)

Three consequences, all stated rather than discovered later. (i) A legitimate
condition-1 repair turns V-21 red; **the architect recomputes the digest and
records the recomputation in this section alongside the repair.** That cost is
the point — it makes every Decision-section edit a deliberate, disclosed act
instead of a silent one. (ii) The same is now true of an edit to the licence
itself, which is the point of the second digest. (iii) As of 2026-07-26 neither
this file nor that spec
has ever been committed (see the status note below), so **no committed baseline
exists to diff a Decision against**; both digests are currently pinned to the
architect's working copy. They become real immutability checks the moment both
files land — one more reason landing them is a precondition rather than a
formality.

**The owner's signature on the work package did not move.** It was written
against the file now named `WP-secret-fence-ep2-redact-arm.md`, and it is still
in that file, unmoved, covering the same three Table B items it always covered.
The detector leg carries no owner signature and needs none: everything it decides
is governed by Decisions 1–7 of this ADR.

## Not yet committed — 2026-07-26 (status note; no Decision changes, no evidence changes)

**This file has never been committed.** Measured 2026-07-26: `git log --all` is
empty for `docs/adr/0034-accidental-persistence-threat-model.md`; it exists only
as an untracked file in the architect's working tree. Recorded here because the
errata blocks above justify amending this ADR rather than the implementing work
package on the ground that **this** is the durable record and that a spec-side
fix would promote the spec's copy to primary. That argument is the right one and
it is unchanged — but until this file lands, it is being made about a document
that is not yet in the repository, so "durable" is an intention rather than a
fact. Both are true at once and neither is quietly dropped.

Two consequences, neither of them a decision:

- **`WP-secret-fence-two-tier-detector` cannot be dispatched until this file is
  committed.** Its verification steps V-11 and V-15 read this ADR, and its
  Definition-of-done item 0 now begins with a `git log` check on this exact path
  whose failure instruction is stop-and-report. An implementer branching from
  `main` today gets red gates they are forbidden to repair: no agent writes the
  `OWNER-SIGNED` line (the work package's row S5), and no agent edits
  `docs/adr/*` under that spec's Deliverables table.
- **Committing this file is the owner's call and no agent makes it** — including
  to clear a red gate, and including "so the work package can start". The
  signature on line 6 is the owner's own text; landing the file that carries it
  is a decision of the same kind.

## Structural correction — 2026-07-26, round 3 (heading insertion only; no wording changes, no Decision changes, no evidence changes)

Applied by **the architect**, disclosed here as conditions 3 and 5 of the
precedent above require. Nothing was reworded, re-dated, added or removed; the
whole edit is one inserted `##` heading.

**What was wrong.** The two paragraphs that follow this block —
`Supersedes, narrowly:` and `Lifts and re-ratifies:` — are **normative**
statements of this ADR's scope over ADR-0024 and ADR-0033. Decision 6's override
is the first; Decision 7's ban is lifted and re-ratified by the second. Before
this edit the heading sequence read as quoted below. **The two-space indent is
this block's quoting device and is not part of the text**; every other byte is
verbatim, and the `…` marks elided body that this edit did not touch:

```text
  ## Not yet committed — 2026-07-26 (status note; no Decision changes, no evidence changes)
  …status-note body…
  **Supersedes, narrowly:** ADR-0024's WP-123 EP2 amendment and ADR-0024's
  rejection of high-entropy-as-`redact`, **for the context-free case only** (see
  Decision 6). …
  **Lifts and re-ratifies:** the permanent shape-allowlist ban first written in
  ADR-0033 (Decision 7). …
  ## Context
```

so both paragraphs were parented to a section whose own stated premise is that
it is temporary and disappears the moment this file is committed. Two normative
paragraphs that two Decisions depend on cannot live inside a block scheduled for
deletion. The round-3 insertion of that status note is what captured them; the
paragraphs themselves are older and unchanged.

**Why a heading rather than moving the status note.** Moving the note below them
would have re-parented the same two paragraphs to the "Cross-reference update"
block instead — a section about a spec split, which is no more their subject
than the status note is. Giving them their own heading fixes the cause instead
of relocating it. Their bytes and their position in the file are untouched.

## Structural correction — 2026-07-26, round 4 (one heading insertion, one cross-reference repair, one qualifier reconciled; no Decision changes, no evidence changes)

Applied by **the architect**, disclosed here as conditions 3 and 5 of the
precedent require. Three edits, each stated with its pre-edit bytes. **No
Decision, no figure and no `OWNER-SIGNED` line is touched by any of them**, and
the round-3 structural correction above is the template this block follows.

**(1) The five-condition precedent was parented to a heading that does not
describe it — the same defect the round-3 correction above just fixed.** It lived
under `## Cross-reference update — 2026-07-26 (spec split; …)`: a permanent
governing rule about when a Decision's prose may be repaired, filed inside a
one-off dated record of a spec rename. A reader arriving at the licence had no
way to see it as a rule rather than as commentary on that particular repair.
Before this edit the heading sequence read as quoted below — **the two-space
indent is this block's quoting device and is not part of the text**; every other
byte is verbatim, and `…` marks elided body this edit did not touch:

```text
  ## Cross-reference update — 2026-07-26 (spec split; no Decision changes, no evidence changes)
  …cross-reference body, ending with the "Decision 6's closing paragraph" paragraph…
  **The precedent this sets, named rather than left to be inherited (added
  2026-07-26, round 3; tightened 2026-07-26 in the round-3 revision).** "Accepted,
  therefore immutable" and "a file this ADR cites was renamed" are in genuine …
  ## Not yet committed — 2026-07-26 (status note; no Decision changes, no evidence changes)
```

The whole of edit (1) is the inserted `##` heading plus the clause
`; given its own heading and its own digest 2026-07-26, round 4` — **eleven
words** — appended to that paragraph's own dated parenthesis, which is how every
other amendment in this file records when it moved. **No sentence outside that
parenthesis was reworded, and edit (1) reordered, added, removed and moved no
paragraph** — the round-5 appendix move disclosed below did move these blocks
bodily, and says so; that is a later, separately disclosed edit, not a
retroactive qualification of this one.
*(Descriptors corrected 2026-07-26, round 5, and disclosed in the round-5
structural-correction block below: this passage called an eleven-word clause "the
four words", and claimed "No paragraph was reworded" in the same breath as
disclosing a reworded parenthesis. The verbatim quotation above was and is
correct, and the edit it describes has not moved — only these two descriptors of
it were wrong.)*

**(2) A dangling cross-reference to a renumbered verification step.** This
document cited the work package's verification step by number in three places.
Round 4 renumbered that leg's step because its number collided with a
*different* check of the same number in the sibling leg
`WP-secret-fence-ep2-redact-arm`, which defeats the purpose of a shared id
scheme. The pre-edit text of the three occurrences, verbatim:

```text
  revision).** Verification step **V-20** of `WP-secret-fence-two-tier-detector`
  condition-1 repair turns V-20 red; **the architect recomputes the digest and
  exists to diff a Decision against**; the digest is currently pinned to the
```

(the third line is context: the sentence it belongs to continues past `V-20`'s
paragraph and was not itself edited). Each `V-20` is now `V-21`. **This is a
condition-1 repair in its purest form** — a pointer that no longer resolves,
repaired to the document it always meant, asserting exactly what it asserted
before. It is disclosed here rather than made silently, as condition 3 requires.
Note that conditions 1 and 5 are satisfied twice over: these three occurrences
sit in the precedent section itself, not inside a Decision, so no Decision's
prose moved at all.

**(3) "No agent may ever amend either" appeared three times, and only one copy
carried its qualifier.** The sentence is stated in the round-2 errata block, in
the round-3 errata block and in the cross-reference block; only the third one
says "with exactly one narrow exception, defined immediately below and nowhere
else". Read alone, either of the first two forbids the very repair the third
licenses — and the round-3 revision reconciled the third copy only. The two
earlier copies now carry a pointer to the exception rather than a second
statement of it, so the licence still lives in exactly one place. Pre-edit
bytes of the two, verbatim:

```text
  this amendment**, and no agent may ever amend either.
  `OWNER-SIGNED` line and Decisions 1–7 are untouched by this amendment**, and no
  agent may ever amend either. Nothing here changes what was decided: a
```

The assertion each makes is unchanged: no agent amends a Decision or the
signature. What is added is the pointer that was already true and already
written down elsewhere.

## Structural correction — 2026-07-26, round 5 (one bodily move of this appendix, one digest-terminator repair, two corrected descriptors; no Decision changes, no evidence changes)

Applied by **the architect**, disclosed here as conditions 3 and 5 of the
precedent above require, and following the round-3 and round-4 blocks as its
template. **Three edits. No Decision, no measured figure, no errata row and no
`OWNER-SIGNED` line is touched by any of them**, and none of the three sits
inside a Decision at all — so conditions 1 and 2, which govern edits to a
Decision's own prose, are satisfied vacuously rather than narrowly.

**(1) The amendment bookkeeping moved bodily to this appendix.** Measured
2026-07-26 on the round-4 file as this round found it: 690 lines, the eight meta
blocks at lines **14–316**, `## Context` at 328 and `## Decision` at 366 —
**45.8% of the file before its first ratified heading**, growing by one block per
review round. (Edits (2) and (3) below were applied first, so the file was 717
lines and the blocks were at 14–343 at the instant the move ran; the figures
above are the state that motivated it.) Before this edit the `##` heading
sequence read as quoted
below. **The two-space indent is this block's quoting device and is not part of
the text**; every other byte is verbatim, and `…` marks elided body this edit did
not touch:

```text
  # ADR-0034: The secret fence's threat model is accidental persistence, not deliberate exfiltration
  …status line, date, the OWNER-SIGNED line and the OWNER-RATIFIED blockquote…
  ## Errata — 2026-07-26 (evidence corrections; no Decision changes)
  ## Errata — 2026-07-26, round 3 (vault re-measurement and one arithmetic correction; no Decision changes)
  ## Cross-reference update — 2026-07-26 (spec split; no Decision changes, no evidence changes)
  ## The five-condition precedent for repairing a dangling cross-reference inside a Decision
  ## Not yet committed — 2026-07-26 (status note; no Decision changes, no evidence changes)
  ## Structural correction — 2026-07-26, round 3 (heading insertion only; no wording changes, no Decision changes, no evidence changes)
  ## Structural correction — 2026-07-26, round 4 (one heading insertion, one cross-reference repair, one qualifier reconciled; no Decision changes, no evidence changes)
  ## What this ADR supersedes and re-ratifies
  ## Context
  ## Decision
  …Decisions 1–7, the measured evidence, the Boundary statement, Consequences…
  ## Alternatives considered
  …end of file…
```

Those eight blocks now follow `## Alternatives considered`, under the
`## Appendix` heading that opens this section, **in exactly the order shown above
and with their bytes unchanged**. Order was preserved deliberately and is not
cosmetic: the round-2 and round-3 errata blocks each point at the precedent as
being "below", and the cross-reference block points at it as "immediately below",
so re-ordering them to put the governing rule first would have dangled three
pointers to buy a tidier appendix. **The only new bytes are the `## Appendix`
heading and its explanatory paragraphs, plus this block.**

**What this move does and does not change for the gates.** `## Decision` …
`## The measured evidence` is untouched, so V-21's first digest is unchanged and
was verified byte-identical after the move. `grep '^| ER-'` reads the errata rows
in file order, and the order is preserved, so V-15's errata digest is likewise
unchanged and was verified. The `notes scanned` … `distinct high-entropy runs`
block and the `E3` paragraph did not move relative to their own delimiters, so
those digests are unchanged and were verified. What **does** move is V-15's
restatement sweep, which digests every remaining line of both documents in file
order — the architect recomputes that literal in this same pass, which is the
disclosed cost the sweep's own note describes.

**(2) V-21's second digest terminated on a heading whose premise expires.** The
range ran from this appendix's precedent heading to the line before
`## Not yet committed` — a *status note* whose entire stated content is that this
file has never been committed, and which therefore disappears on the very commit
that the implementing work package's dispatch blocker requires. Measured
2026-07-26 by deleting that section, on the round-4 layout: the range runs
**82 → 567 lines**, swallowing Context, all seven Decisions, the measured
evidence, the Boundary statement, Consequences and Alternatives. (After edit (1)
below the same deletion runs it **100 → 338 lines**; smaller, because the
Decisions are no longer downstream of it, and still wrong.) That fails red rather
than open — but for the wrong reason, and its instructed repair ("recompute the
literal") would silently convert a licence digest into a whole-appendix one that
then reddens on every unrelated dated block, while the range's only probe
asserted non-emptiness and so could never have noticed. Pre-edit bytes of the
sentence that described it, verbatim:

```text
  V-21 therefore now carries a **second** digest, over this heading through the
  line before `## Not yet committed` — i.e. the whole precedent, its five
  conditions, this enforcement paragraph and the signature note that closes the
  section. Editing any of it is now an architect act with a disclosed
  recomputation, exactly like editing a Decision.
```

The terminator is now **the next `##` heading, whatever it happens to be**, which
cannot be deleted because it is defined by position rather than by name.
Measured on this file it selects the **same 82 lines and produces the same
digest** as the old form, so this is a hardening of the enforcement and not a
re-scoping of the licence: the set of bytes under the digest is identical.
`## What this ADR supersedes and re-ratifies` was considered as a named stable
terminator and rejected on a fact this same block creates — after edit (1) that
heading sits *above* this appendix, so it can no longer terminate anything here.
V-21's probe was extended in the same pass to assert the range contains
**exactly one `##` heading**, so a range that has swollen past its own section
now fails loudly instead of being repinned. Round 5 asked for "the range must not
contain `## Decision`"; the heading count is the strict form of that and is the
one that can actually fire, because edit (1) also puts the Decisions above this
appendix — measured, a range swollen to end-of-file now contains five `##`
headings and zero Decisions, so a Decision-specific probe would pass on it.

**This edit is inside the licence, and that is exactly the case the licence's own
second digest exists to catch.** It therefore turns V-21's second digest red by
construction, and the architect recomputes that literal in this same pass, in the
work package that carries it. Nothing about who may edit, or what may be edited,
changed: the five conditions are byte-unchanged, condition 5 included.

**(3) Two wrong descriptors in the round-4 block above.** That block described an
eleven-word clause as "the four words", and asserted "No paragraph was reworded"
in the same sentence as disclosing a reworded parenthesis. **The verbatim
quotation it carries was and is correct, and the round-4 edit it describes has
not moved** — only these two descriptions of it were wrong, which is precisely
why condition 2 requires the verbatim quote and not the paraphrase. Pre-edit
bytes, verbatim:

```text
  The whole of edit (1) is the inserted `##` heading plus the four words
  `; given its own heading and its own digest 2026-07-26, round 4` added to that
  paragraph's own dated parenthesis, which is how every other amendment in this
  file records when it moved. **No paragraph was reworded, reordered, added or
  removed, and no paragraph changed position in the file.**
```

The replacement says "eleven words", scopes the no-rewording claim to everything
outside the parenthesis, and scopes the no-movement claim to edit (1) — because
edit (1) of this block did move those blocks bodily and says so.

## Errata — 2026-07-28 (vault re-measurement after leg 1 merged; no Decision changes)

Applied by **the architect**, in the form this appendix's opening paragraph
requires: a dated block that states what moved, quotes the pre-edit bytes
verbatim, and names the digests it obliges the architect to recompute.

**What happened.** `WP-secret-fence-two-tier-detector` — leg 1 of the fence —
merged on 2026-07-26 as `72f3e46`. The evidence in this document was last
re-measured on 2026-07-26 against a **182**-note vault. Re-run on 2026-07-28
against the same vault, now **189** notes, every figure in E1, E2 and E3 moved
and **no structural fact and no conclusion did**. That is precisely the
"re-measurement event" ER-4 said this mechanism would handle, arriving for the
second time.

**Why an errata amendment and not a new ADR, checked against this document's own
licence rather than assumed.** The errata mechanism defined above covers
**measured evidence only**; the five-condition precedent's closing paragraph says
so in as many words — *"the errata mechanism above covers measured evidence only,
and the Decisions are outside it"*. Every edit in this block is a measured figure
in E1, E2, E3 or in a sentence that quotes one. **Decisions 1–7 are untouched,
byte for byte, and so is the owner-signature line on line 6** — no agent may ever
amend either, and this block does not invoke the dangling-cross-reference
exception, which is not needed here because nothing inside a Decision is edited
at all. Decision 3's parenthetical cites Evidence E1 by name and carries no
figure, which is why a re-measurement leaves it alone. The decisions re-derive
identically from the corrected figures: a vault that reverts 57.7% instead of
56.0% is the same problem slightly larger, and nothing in this ADR turns on the
third significant figure.

> **OWNER-RULED IN SESSION — 2026-07-28 (TRANSCRIBED BY THE ARCHITECT, NOT
> OWNER-TYPED).** The owner was asked whether this errata block needs his
> signature and answered that it does not need one and that he passes on signing
> it. This paragraph records that the question was put and answered. **It is not
> a signature, it is not an approval line, and no gate may ever key on it** — the
> merge gate keys on an owner-written signature line, which no agent ever writes
> (row S5 of `WP-secret-fence-ep2-redact-arm`'s owner-signature-form table). The
> architect verified the ruling against the licence text before relying on it,
> and the reading above is that verification: an errata block needs no signature
> because it corrects measured evidence and touches no Decision and no signature
> line. Had a Decision genuinely moved, this would have been a new-ADR event and
> the ruling would not have reached it.

**Pre-edit bytes, verbatim. The two-space indent is this block's quoting device
and is not part of the text** — the same device the round-5 structural correction
above uses, and here it is load-bearing rather than tidy: `WP-secret-fence-two-tier-detector`'s
V-15 digests the E1 block by a content-addressed `sed` range running from
`^notes scanned` to `^distinct high-entropy runs` (each pattern ends in a space,
which is not shown here), so an unindented verbatim quotation of that block
elsewhere in this file would extend the range over everything in between. A
quotation must not change what a checker reads.

```text
  E1–E3 were re-measured on **2026-07-26** against the shipped detector at commit
  `efd1489` and the maintainer's real vault (**182** markdown notes under
  `~/Obsidian/gyula`, excluding `.git`/`.obsidian`/`.trash`); the vault is private
  and is not checked in. E4 was produced on 2026-07-25 against the same commit.
  The vault is a live corpus — see errata ER-4 for what that means for a later
  reproduction.

  notes scanned                                    182
  notes with ANY finding (EP2 reverts today)       102   (56.0%)
      high-entropy ONLY                            101
      a labelled rule ONLY                           0
      both                                           1   (a documented AKIA placeholder)
  findings by rule:  high-entropy 299 occurrences  |  aws-key 1
  distinct high-entropy runs                       106

  **E2 — the 7-character structural void.** Of the 106 distinct high-entropy
  runs, **102 contain a `/`**, and every one of those is a file path or a
  slash-joined prose list. … (Distribution of the longest segment per run: 7→3, 8→8, 9→23,
  10→27, 11→3, 12→29, 13→4, 14→4, 17→1.)

  **E3 — the design's measured end state.** Labelled rules at `quarantine` plus a
  context-bound tier and a context-free tier: notes withheld **102 → 1** (the
  pre-existing `AKIA` placeholder, a labelled-rule hit unaffected by any of
  this), notes scrubbed in place **0 → 9**, notes untouched **80 → 172**.

  Scanned on 2026-07-26 with the shipped detector at commit `efd1489` against the
  maintainer's real vault (182 markdown notes): **102 notes (56.0%) contain at
  least one finding and would be reverted by EP2.**

  - **A false positive stops costing the user a note.** Measured: 102 withheld
    notes become 1 withheld and 9 scrubbed-with-a-preserved-original.

  - **Keep today's behaviour (withhold on any finding).** Rejected on
    measurement: 56.0% of a real vault reverted, permanent content loss already
    incurred, and the destructive share attributable to one rule is 100%.
```

`…` marks elided body that this edit did not touch: E2's middle sentences and the
tails of the two bullets are byte-unchanged and are not requoted.

| # | What was wrong | Where | Correction |
|---|----------------|-------|------------|
| ER-7 | E1's figures were a 2026-07-26 snapshot of a corpus that has grown again: **182** notes, **102** with any finding, **56.0%**, a **101 / 0 / 1** source split, **299** `high-entropy` occurrences and **106** distinct runs | E1, the Context paragraph, the evidence header, the third "Consequences" bullet and the first "Alternatives considered" bullet | Re-measured 2026-07-28 over **189** notes: **109** with any finding, **57.7%**, split **108 / 0 / 1**, **315** `high-entropy` occurrences, **110** distinct runs. **Every structural fact is unchanged** — one labelled-rule finding in the whole corpus, still `aws-key`, still the documented `AKIA…` placeholder, so E1's headline claim re-derives identically and **its commentary paragraph is byte-unchanged**, ER-6's correction included. Two things about the block itself are new and are stated rather than left to be noticed. (a) **The evidence header now records which detector each block is measured against**, which the 2026-07-26 text did not have to: leg 1 has merged, so E1 and E2 are the *pre-leg-1* pass reproduced by `scripts/measure-secret-fp.js`, while E3 is the shipped module. (b) **The block's value column is one character wider.** It is that script's current output verbatim; the script is a leg-1 deliverable that did not exist when the 2026-07-26 copy was hand-assembled, and it pads the value field to five columns where the hand-built copy padded to four. No digit moved because of the padding |
| ER-8 | E2's counts were the same snapshot — "Of the **106** distinct high-entropy runs, **102 contain a `/`**", with the longest-segment distribution `7→3, 8→8, 9→23, 10→27, 11→3, 12→29, 13→4, 14→4, 17→1` | E2 | Re-measured 2026-07-28 over the same corpus by the same construction: **110** distinct runs, **106** containing a `/`, distribution `7→3, 8→9, 9→25, 10→28, 11→3, 12→29, 13→4, 14→4, 17→1` (which sums to 106, as the pre-edit one summed to 102). **The 7-character structural void — the only thing E2 argues from — is unchanged**: the longest slash-free segment in any of those runs is still **17** characters against a 24-character floor. **E2's qualitative claim, that every slashed run is a file path or a slash-joined prose list, was re-checked over the new set rather than inherited**, and structurally rather than by publishing any of them: all 106 have every slash-free segment ≤ 17 characters, all 106 have every segment word- or identifier-shaped (`[A-Za-z0-9._-]` only), 105 of 106 have a vowel in every segment longer than three characters, and **none of the 106 contains a `+` or an `=`** — no run in the set carries a base64 marker. ER-4 recorded E2 as reproducing byte-identically; that is no longer true of its counts and is still true of its conclusion, and the two claims are deliberately not conflated |
| ER-9 | "notes withheld **102 → 1** … notes untouched **80 → 172**" | E3 | **109 → 1** and **80 → 179**. Scrubbed in place **0 → 9** is unchanged, and so is the parenthetical naming the one survivor. The *before* column of the untouched row is **80 in both measurements**, which is arithmetic and not luck: 182 − 102 = 189 − 109 = 80. **E3 is now measured against the shipped, merged detector** rather than against the from-spec prototype it rested on when it was written, leg 1 having landed at `72f3e46` — the evidence got stronger while the figures moved |

Nothing else in this ADR is amended by this block.

**The digests this obliges the architect to recompute, named exhaustively and
each with its disposition**, because a re-measurement that names only the ones it
recomputes is how a stale pin survives:

- **`WP-secret-fence-ep2-redact-arm` V-17** — five `grep` literals over this file
  (`notes scanned`, `notes with ANY finding`, and the three E3 fragments) and the
  two whole-line canonical rows **D1** and **D2**. **Recomputed in this pass**,
  by re-deriving that spec's D-table from this file, which is the only legal
  direction; that leg is `Ready` and its suite still runs.
- **`WP-secret-fence-two-tier-detector` V-15** — `M1_EXPECT`, `M5_EXPECT`,
  `E3_EXPECT`, `ER_EXPECT` and `SWEEP_EXPECT`. **Deliberately NOT recomputed.**
  Leg 1 merged at `72f3e46` and its spec is `status: Done` at
  `docs/specs/done/WP-secret-fence-two-tier-detector.md`; its M-blocks are the
  dated evidence the shipped work was accepted against and are frozen as a
  record, and its verification block is retired with it. The reasoning, and the
  instruction not to "repair" those literals, is written into that spec in the
  same pass. `ER_EXPECT` would have moved on the three rows above alone — the
  V-15 note that anticipates "adding ER-7 changes this digest" is that
  anticipation arriving.
- **V-21's two digests** (this file's `## Decision` … `## The measured evidence`
  range, and the five-condition precedent range) — **untouched and verified
  byte-identical after this block**, which is the check that no Decision and no
  licence moved.
- **V-18**, the ratified threat-model section mirrored in both legs, and
  **V-11**, over the owner's two signature lines — **untouched and verified**.
  Neither may ever be recomputed by anyone.
- **`WP-secret-fence-ep2-redact-arm` V-20**, over that spec's Provenance section
  — moved in this pass, but **not by this block**: the owner typed a reaffirmation
  line into that section on 2026-07-27. It is disclosed there, at the step that
  sanctions it.
