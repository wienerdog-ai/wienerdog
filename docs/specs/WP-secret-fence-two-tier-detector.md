---
id: WP-secret-fence-two-tier-detector
title: Make the secret detector two-tier — a slash-tiered entropy alphabet, separator-bound context, and quarantine severity on every labelled rule
status: Draft
model: opus
size: M
depends_on: []
adrs: [ADR-0004, ADR-0024, ADR-0031, ADR-0034]
epic: secret-lifecycle
---

# WP-secret-fence-two-tier-detector: stop the entropy pass firing on 56% of the vault

## Provenance — this is leg 1 of a two-leg split

This work package and `WP-secret-fence-ep2-redact-arm` are the two halves of a
spec formerly filed as **`WP-secret-fence-two-tier-entropy`**. The owner
authorised the split on 2026-07-26. If you followed a pointer to that old id
from a superseded spec, from `docs/specs/logbook/`, or from `ADR-0033`, this is
where its detector half went; its EP2-gate half is
`docs/specs/WP-secret-fence-ep2-redact-arm.md`.

The split line is exactly the Table A / Table B boundary the parent spec had
already drawn.

**This table records DECISION SCOPE ONLY — which canonical tables each leg
owns — and deliberately enumerates no files.** Round 1 of the design gate found
the two legs' boundary tables carrying divergent file lists, each an unregistered
mirror of the other leg's Deliverables and each already drifted (leg 2's copy
omitted `docs/GLOSSARY.md`, which this leg edits; this leg's copy named one of
leg 2's four tables and three of its eleven paths). **Each leg's own
Deliverables table is the sole enumeration of its files**, and neither leg
restates the other's — under the One-Document Rule (ADR-0005) neither
implementer may open the other's file, so nothing here could ever catch such a
list drifting.

| leg | canonical tables it owns |
|-----|--------------------------|
| **1 — this one** | **Table A** (what the detector emits) and **Table C** (the corpora and the acceptance numbers) |
| 2 — `WP-secret-fence-ep2-redact-arm` | **Table B** (what the EP2 gate does with a finding), **Table Q** (what every shipped claim about EP2's disposition says afterwards), **Table R** (the redact arm's outcome matrix) and **Table T** (how each outcome is produced and observed) |

**Leg 1 ships first and ships alone.** It is safe on its own — see "The interim
behaviour" below, which is the honest description of what a user gets after this
WP merges and before leg 2 does. **Leg 2 must never go first**; the reason is in
"Why leg 2 cannot go first" under Implementation notes, and it is why leg 2
carries `depends_on: [WP-secret-fence-two-tier-detector]`.

**This WP carries no owner signature and needs none.** Every decision in it is
governed by **ADR-0034**, which is `Status: Accepted` and carries the owner's own
`OWNER-SIGNED 2026-07-25` line. Verification step **V-11** checks that ADR and
nothing else. The parent spec's owner signature covers three items — the narrow
override of ADR-0024, Table B rows B4/B5/B10, and Table B rows B6/B7/B12/B13 —
**all three of which are Table B rows and all three of which stayed with leg 2,
in the same file, unmoved.** Nothing in this document rests on that signature.
**Do not add an `OWNER-SIGNED` line to this file.** No agent writes that line,
ever, for any reason (see the "Owner signature form" table, row S5).

### What warrants the split, since git does not

**Recorded here because it is surprising, and because leg 2 discloses the same
fact — asymmetric disclosure of one fact across two legs of one split is exactly
the mirror drift ADR-0031 targets, and round 1 of the design gate found this leg
silent while the sibling was square about it.**

**There is no pre-split blob.** The parent id `WP-secret-fence-two-tier-entropy`
reads like a traceable predecessor and is not one. Measured against today's
`main` in this pass: `git log --follow` on either leg file returns exactly one
commit, `7ef4c51` (2026-07-26), which **added** both files under their final
names; `git rev-list --all --objects` finds **no object under the path**
`docs/specs/WP-secret-fence-two-tier-entropy.md` in any tree that has ever
existed; and `git log --all -S 'WP-secret-fence-two-tier-entropy'` returns that
same single commit, whose only hits are the *string* inside the four blobs it
added. **`7ef4c51` is an add, not a rename**, so no `git log --follow`, no
`--find-renames` and no blob diff can show what the split moved, and an earlier
review brief's premise that "the parent file renamed in place, so `git log
--follow` holds the parent" is false.

**So the split's warrant is not git history. It is, exactly and only:**

1. **this section and its counterpart in leg 2**, which state what moved and
   what did not;
2. **the owner's authorization of the split, given on 2026-07-26**; and
3. **the owner signature block at the end of `WP-secret-fence-ep2-redact-arm`**,
   whose bytes that leg's V-11 pins by digest — the signature never travelled,
   because everything it names is a Table B row and Table B never left that file.

**"Nothing was lost in the split" is therefore checkable by id reconciliation,
not by history**: every criterion, verification and mutation id this leg declares
as a gap (AC-7 … AC-10, AC-14, AC-19; V-4, V-5, V-9, V-13, V-16, V-17; M-7 …
M-12, M-16, M-17) exists in the sibling, and the design gate re-runs that
reconciliation each round. **Nobody fabricates a commit, a rename or a signature
line to make this look tidier.**

<!-- OWNER REAFFIRMATION SLOT — leg 1.
     Prepared, deliberately EMPTY, and never filled by an agent.

     Because the split has no git record, the strongest available confirmation
     that these two documents are the ones the owner authorised is the owner
     saying so ABOUT THE COMMITTED FORM. If he wants to give it, he types one
     line immediately below this comment, in his own words, in this form:

         OWNER-REAFFIRMED <YYYY-MM-DD> — the split into
         WP-secret-fence-two-tier-detector and WP-secret-fence-ep2-redact-arm,
         as committed, is the split I authorised on 2026-07-26.

     THE TOKEN IS `OWNER-REAFFIRMED`, NEVER `OWNER-SIGNED`, and that is a
     mechanical requirement rather than a stylistic one. Verified in this pass:
     V-11's signature pattern is `^[> *]*OWNER-SIGNED[ —–-]*[0-9]{4}-[0-9]{2}-[0-9]{2}`
     and leg 2 asserts it matches EXACTLY ONCE in that file, once inside its
     `## OWNER-APPROVED` section, and that the two matched lines (ADR + leg 2)
     hash to one pinned digest — so a second signature line anywhere would
     break that gate three ways. This leg's V-11 additionally FAILS if such a
     line appears in this file at all (S4/S5). `OWNER-REAFFIRMED` matches
     neither pattern; measured in this pass, both greps score 0 on it.

     MIND THE LEADING WHITESPACE, and this is not a hypothetical: the pattern's
     prefix class `[> *]*` CONTAINS A SPACE, so an indented line whose first
     non-blank token is the signature marker MATCHES. The first draft of this
     very comment tripped it — leg 2's slot quoted the marker at the start of an
     indented line and V-11 counted two signatures in that file. Caught by
     RUNNING V-11 rather than reading it. Never begin a line in this comment
     with that marker; put it mid-sentence, as this paragraph does.

     IT IS DELIBERATELY NOT A GATE. Nothing in the verification block requires
     this line to exist, because requiring it would invent a dispatch blocker
     out of an owner action nobody has yet asked for. What IS held: this whole
     comment is inside V-15's swept region, so deleting or rewording the slot
     moves SWEEP_EXPECT and the architect must disclose it.

     S5 IS UNCHANGED AND ABSOLUTE: no agent writes an owner line of any kind,
     including this one, including "to make the two legs look symmetrical". -->

## Context (read this, nothing else)

Wienerdog's nightly **dream** consolidates recent Claude Code / Codex sessions
into the user's markdown **vault** (a git repository at `~/Obsidian/<name>` or
`~/wienerdog/`). Before the dream's single commit, every staged change passes
the **EP2 staged-output gate** (ADR-0024): `src/core/dream/validate.js` scans the
git-computed *added* lines of each file with the ONE shared detector
`scanAndRedact` (`src/core/secret-scan.js`) and, on **any** finding of **either**
severity, preserves the working-tree file into `state/quarantine/` and reverts
it. The note is not committed. The same detector gates three digest sections at
EP4 (`src/core/digest.js:506,521,543`) and sanitizes five other durable sinks
through `redactOnly`.

The detector has two layers. **Eighteen labelled rules** (private-key blocks,
provider prefixes, bearer headers, sensitive `key=value` assignments, JSON values
under a sensitive key) are precise and contextual. Behind them sits **one
context-free entropy pass**: any run of 24+ characters drawn from
`[A-Za-z0-9+/=]` whose Shannon entropy is ≥ 3.5 bits/char is labelled
`high-entropy` at `quarantine` severity.

**That entropy pass is destroying the product.** Measured on the maintainer's
real vault on 2026-07-26 (182 notes, shipped detector at commit `efd1489`):
**102 of 182 notes (56.0%) contain at least one finding and would be reverted by
EP2.** 101 of those fire on `high-entropy` alone; across all eighteen labelled
rules of the shipped detector the whole corpus yields a single `aws-key`
finding, and that one is a documented `AKIA…` placeholder in a security note.
Every destructive false positive comes from a single mis-scoped rule. On
2026-07-24 the live dream reverted three legitimate notes and, because the
transcript ledger had already marked those sessions processed, that content was
lost permanently.

**This WP fixes the detector and does not touch any gate.** It replaces the
context-free entropy pass with two tiers (a narrow alphabet that fires at
`redact` with no context required, and today's wide alphabet that fires at
`quarantine` only when a sensitive keyword binds to the candidate through a
separator on the same line), it raises every one of the eighteen labelled rules
to `quarantine`, and it adds a nineteenth for `Authorization: Basic` — the one
published credential class the tiering would otherwise stop catching at all
(Table A row A16, measurement in M4d). `src/core/dream/validate.js` is **not**
in the Deliverables table.

**IRON RULE (ADR-0004): Wienerdog is just files.** This WP starts no process,
opens no socket, and sends nothing off the machine. It edits one `src/` file,
adds two test files and one offline script, edits one test file and the glossary.

### The interim behaviour — what the user actually gets when this merges

This is what the owner is buying first, and it must not be oversold.

After this WP merges and before `WP-secret-fence-ep2-redact-arm` merges, **EP2
still keys on `findings.length > 0`.** It does not consult severity — `validate.js`
does not import `hasHardFinding`, and this WP does not change that. So:

- A note with **any** finding, at **either** severity, is still **withheld and
  reverted**: preserved into `state/quarantine/`, removed from the working tree,
  not committed, and counted in `secretReverts`.
- `secretReverts > 0` still makes `src/cli/dream.js:577` **defer** this run's
  transcripts (`WP-secret-revert-defers-ledger`, shipped in `efd1489`).
- **Nothing is redacted in place.** There is no `state/quarantine/redacted/`
  directory, no `## Redacted in place (secret scan)` report section, and no
  retention cap. All of that is leg 2, and the cap's size is decided in that
  leg's **Table B row B12** — this document cites the row and deliberately does
  not restate the number.

What changes is **how many notes reach that outcome**. On the maintainer's real
vault the revert count drops to the **sum of M5's withheld row and M5's
scrubbed-in-place row**, because under the unchanged EP2 those two dispositions
are the same disposition: a revert. **Row M5a is the only place in this document
that states the resulting figure** — read it there, and do not restate it
anywhere else. **The honest one-line summary of this WP is "most of those reverts
stop happening", not "those notes get redacted".** The redaction outcome arrives
with leg 2.

**What the fail-closed claim does and does not say.** Notes whose *only* current
finding disappears — the path-shaped false positives this WP exists to kill —
**now commit**. That is the intended improvement, and it is a real loosening of
EP2's effective behaviour even though EP2's code is untouched: the gate keys on
`findings.length > 0` and this WP removes findings. An earlier revision of this
paragraph claimed "nothing this WP does causes a note to be committed that today
would be withheld", which is false as worded and is the whole point of M5a.

What stays fail-closed is the disposition of every finding that **remains**: a
note retaining any finding, at either severity, is still withheld and reverted.
So every note leg 2 will later scrub-and-commit is, in the interim, withheld
instead — the more conservative of the two outcomes — and the fail-closed
comparison applies to that set and only to it. EP1, EP3 and EP4 loosen as well
and never withheld anything (Table A row A14 and AC-17); that loosening is the
point of the WP and is asserted, not assumed.

## The threat model — this is the review criterion, not a suggestion

**Ratified as ADR-0034** (`docs/adr/0034-accidental-persistence-threat-model.md`,
`Status: Accepted`; ratified by the owner in session on 2026-07-25, transcribed
by an agent — the merge gate additionally requires an owner-written
`OWNER-SIGNED` line, see V-11). ADR-0034 is the canonical source
for everything in this section; the text below is this spec's inline copy,
because an implementer reads only this file (the One-Document Rule, ADR-0005).
ADR-0034 is Accepted and therefore immutable — if a review would change what
this section says, that is a new-ADR event, not a spec edit.

**This section is byte-identical in both legs of this epic** —
`WP-secret-fence-two-tier-detector` (the detector) and
`WP-secret-fence-ep2-redact-arm` (the EP2 gate). Each leg's verification step
V-18 checksums it against the same literal digest, so an edit to either copy is
caught by that leg's own suite. If you believe it needs to change, that is the
new-ADR event named above, not an edit here.

**Every previous review round on this problem was implicitly judged by "can you
construct a string that slips through?" That criterion has exactly one fixed
point — quarantine everything that looks random — because a 44-character random
API key and a 44-character random Google Doc id are byte-distribution
identical. No algorithm separates them.** The predecessor spec ran six rounds
and produced a fail-open critical in five consecutive ones, not because its
rules were bad but because the criterion was unwinnable. The loop could only
converge on today's behaviour, which is measurably unusable. This section exists
so that reviewers judge against a fixed model instead of producing
counterexamples.

**IN SCOPE: accidental credential persistence.** The user pasted a key into a
session; the dream must not copy it verbatim into plaintext markdown in the
vault.

**OUT OF SCOPE: deliberate adversarial exfiltration.** An attacker who wants a
key in the vault — for example via prompt injection in a transcript — encodes it
trivially: split across two sentences in 12-character pieces, spelled word by
word, wrapped in a benign-looking URL. On a free-text LLM-authored channel the
number of covert channels is unbounded, so **no content filter can stop
deliberate exfil.** Today's strict filter does not stop it either; tightening
only taxes the honest path. Containment of a missed secret is ADR-0025's
hermetic runtime profile (the dream brain has no network and no Bash) and
ADR-0026's capability broker (the model cannot self-authorize an external send)
— not this scanner. ADR-0024 already says this in its "Boundary statement (the
A5 residual)".

Three consequences, binding on this spec and on its review:

1. **For accidental persistence, format + context detection is sufficient.**
   Real credentials have formats. Providers added prefixes (`sk-ant-`, `ghp_`,
   `AKIA`, `GOCSPX-`, `glpat-`, `npm_`) *precisely so that scanners can find
   them*. That is the design point the industry converged on, and it is what
   gitleaks — 222 rules — is built out of.
2. **A hypothetical "credential that happens to look exactly like a file path or
   a doc id" is adversarial input by definition, therefore out of scope,
   therefore not a valid objection to a rule in this spec.**
3. **Live verification is out of scope and stays out.** trufflehog-style
   verification (calling the provider to check whether a key is real) would mean
   sending key-suspicious material to the network from a job whose entire
   security argument is that it has no network. That is its own risk class and it
   violates ADR-0004's just-files, no-network ethos. Do not propose it.

### Copy this block verbatim into the Codex review brief and the wd-reviewer brief

The threat model must travel with the review, not live only in this file. If it
lives only here, the next round reboots the "find a bypass" game — the failure
that cost six rounds. Paste this, unedited, into the brief for every review of
this WP:

> **Review criterion for every work package implementing the secret fence under
> ADR-0034 (epic `secret-lifecycle`) — ratified as ADR-0034 (Accepted,
> 2026-07-25). This is a decision, not a proposal; a reviewer who disagrees with
> it is asking for a new ADR.** In scope:
> accidental credential persistence (a user pasted a key into a session; it must
> not reach plaintext markdown in a git-tracked vault). Out of scope: deliberate
> adversarial exfiltration — an attacker who wants a key in the vault splits,
> spells, or re-encodes it, and no content filter on a free-text LLM channel can
> stop that; containment is ADR-0025/ADR-0026, not this scanner.
> **Therefore: a counterexample string that a human deliberately shaped to evade
> a rule is NOT a finding.** A finding must be one of: (a) a real, named,
> published credential format that the change stops catching relative to today's
> shipped detector; (b) a false positive class measured on real user prose; (c) a
> defect in the code, contracts, or verification as specified. Report anything
> else under "observations", not as a blocking finding.

## Current state

### Capture point — read this before you report a line number as wrong

**Every executable claim in this document — line numbers, greps, digests,
"today" behaviour — was RE-VERIFIED against `main` at `cea31e0` on 2026-07-27,
which is the capture point of this revision.** The design claims were originally
read at `efd1489` on 2026-07-25 and that is still where the *measurements* come
from; what moved is the repository around them.

**This is capture-drift instance six of seven in this epic, and naming it once is
cheaper than patching it finding by finding.** The `0.11.0` batch merged on
2026-07-26–27 and moved `main` underneath both legs of this split: `src/cli/dream.js`
gained three lines at ~`:382` (the `schedulerLine` cache fix), `docs/THREAT-MODEL.md`'s
stance clause was rewritten by `WP-stance-authority-containment`, completed specs
relocated into `docs/specs/done/`, and the `docs/` tree grew. Round 1 of the design
gate found seven stale citations across the two legs, every one of them a
consequence of that single event and none of them a design error.

**What that means for you as the implementer.** A line number in this document is
a *convenience*, re-pinned at the capture point above; the **content** beside it
is the contract. If a cited line has moved but the content is where the document
says it is, that is drift and you report it — you do not treat it as a spec bug
and you do not stop. If the **content** is not there, that is a spec bug: stop
and say so. Digests and greps are different: those are gates, and a red one is
never drift you may work around.

Every claim below was read at commit `efd1489` on 2026-07-25 and re-verified at
`cea31e0` on 2026-07-27. **`src/core/secret-scan.js` is byte-unchanged between
the two** (`git diff efd1489 cea31e0 -- src/core/secret-scan.js` is empty), so
every line number in it holds exactly.

**`src/core/secret-scan.js`** (242 lines, pure, zero deps).

- `ScanLimits` (lines 21–25): `{ SCAN_MAX_BYTES: 256*1024, ENTROPY_MIN_LEN: 24,
  ENTROPY_MIN_BITS_PER_CHAR: 3.5 }`.
- `SEVERITY` (line 32): `{ REDACT: 'redact', QUARANTINE: 'quarantine' }`.
- `SENSITIVE_KEYS` (lines 42–43) — a longest-first alternation string, reused by
  the JSON-value rule (line 127) and the extended-assignment rule (line 139).
- `QUARANTINE_KEYS` (line 56) = `Set{aws_secret_access_key, aws_session_token}`;
  `severityForKey(key)` (lines 65–68) returns `QUARANTINE` for those two and
  `REDACT` for everything else.
- `RULES` (lines 87–153) — eighteen labelled rules. **Severities today:**
  `private-key` (line 92) and `stripe-secret-key` (line 151) are `QUARANTINE`;
  the other sixteen call sites pass `SEVERITY.REDACT` (lines 96, 97, 98, 99,
  100, 101, 102, 106, 111, 119, 148, 149, 150, 152) or route through
  `severityForKey` (lines **131 and 142**). *Corrected in round 1 of the design
  gate: both this line and Table A row A10 said `131, 141`. Measured on the
  unmodified module, line 141 is `const label = labelForKey(key);` and the call
  site is line **142**. This was wrong at authoring, not capture drift —
  `secret-scan.js` is byte-identical to `efd1489` — and it matters because A10
  names the exact edit sites an implementer patches.*
- `ENTROPY_CANDIDATE` (line 155) = ``new RegExp(`[A-Za-z0-9+/=]{${ScanLimits.ENTROPY_MIN_LEN},}`, 'g')``.
- `bitsPerChar(run)` (lines 158–170) — Shannon entropy over the run.
- `entropyPass(text, add)` (lines 180–186) — a single `text.replace` over
  `ENTROPY_CANDIDATE`; every candidate at or above the floor becomes
  `[REDACTED:high-entropy]` and adds a **`QUARANTINE`** finding (line 183). **It
  receives no offset and consults no surrounding text — it is context-free.**
- `scanAndRedact` (line 200) runs `RULES` in order, then `entropyPass`, inside
  one `try`. `hasHardFinding(findings)` (line 238) returns true iff any finding
  is `QUARANTINE`. Exports at line 242.

### The four gates, and what this WP does to each

Read this so you know exactly where the blast radius stops. **None of these
files is in the Deliverables table; none of them changes.**

- **EP1 (transcript input)** — `src/core/transcripts/index.js:8` and
  **EP3 (durable log / alert / evidence / brain path)** —
  `src/cli/run-job.js:13`, `src/core/alerts.js:6`, `src/core/dream/brain.js:7`,
  `src/core/run-evidence.js:19`. All five call `redactOnly(text)`, which is by
  definition `scanAndRedact(text).text`. They ignore severity entirely. Their
  **output changes** under this WP — strictly less redaction — because tier 1
  replaces fewer runs than today's context-free pass. See Table A row A14 and
  AC-17.
- **EP2 (the brain's staged output)** — `src/core/dream/validate.js:14` imports
  **`scanAndRedact` only**. Step 3's gate is `const { findings } =
  scanAndRedact(added); if (findings.length === 0) continue;` — **severity is
  never consulted anywhere in that file**, `hasHardFinding` is not imported, and
  it has **no caller in `src/` at all** (verified at `efd1489`; the only
  references are in `tests/unit/secret-scan.test.js`). On any finding it
  preserves the working-tree bytes into `<stateDir>/quarantine/` (dir 0700, file
  0600), reverts the file, counts `secretReverts`, and writes a
  `## Reverted by orchestrator (policy enforcement)` line into the dream report.
  **This WP changes none of that**, which is why raising sixteen labelled rules
  from `redact` to `quarantine` (A10) and adding a nineteenth rule already at
  `quarantine` (A16) are behaviourally inert until leg 2: no shipped code
  branches on severity.
- **EP4 (per-digest-section gate)** — `src/core/digest.js:506,521,543` key on
  `findings.length > 0` and omit the section. Their **output changes** under this
  WP — strictly fewer omissions. No call site is edited.
- **`src/cli/dream.js:577`** (`const reverts = res.secretReverts;` — re-pinned at
  the capture point; it was `:574` at `efd1489` and the `0.11.0` batch inserted
  three lines above it) reads `res.secretReverts` and, when it is non-zero,
  **defers** this run's transcripts instead of marking them processed
  (`WP-secret-revert-defers-ledger`, shipped in `efd1489`). Three deferrals, then
  a loud quarantine. The counter keeps its meaning and its value semantics here:
  "content this run produced was NOT committed."

**Tests.** `npm test` is `node tests/run.js`, which is the **only** place
`WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set (`tests/run.js:7`). `npm run lint` is
`node scripts/lint.js`. `tests/unit/secret-scan.test.js` asserts today's
severities at lines 39, 55, 87, 95, 112, 119, 123, 140, 153 and the entropy pass
at 174–193.

**`tests/unit/dream-validate.test.js` and `tests/unit/digest.test.js` must pass
UNMODIFIED, and this was checked rather than hoped.** Every secret fixture in
those two files is a **labelled-rule** hit whose behaviour this WP does not
change: `AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`,
`refresh_token=1//0abcDEFghiJKLmno-_pqr`, `-----BEGIN RSA PRIVATE KEY-----`,
`sk-ant-abcdefghijklmnopqrstuvwx0123`, `password=hunter2secret1234567`,
`sk_live_a1b2c3d4e5f6g7h8`, `sk-abcdefghijklmnopqrstuvwxyz123456`. The one
entropy-only fixture is `dream-validate.test.js`'s
`'ref q7PmXz4KvR9tWc2LbN8dYfGh in prose\n'` — under this WP that run has no bound
context, so it falls to tier 1 and yields a `redact` finding; EP2 still keys on
`findings.length > 0`, so it is still reverted and that test still passes
unchanged. **If either file needs an edit to go green, stop: that is a spec bug,
not an ambiguity. Say so in the PR and do not edit them** — they are not in the
Deliverables table.

## The measurements this design rests on

Every number below was produced on **2026-07-26** against the shipped detector at
`efd1489` and the maintainer's real vault (182 markdown files under
`~/Obsidian/gyula`, excluding `.git`/`.obsidian`/`.trash`). The vault is private
and is **not** checked in; `scripts/measure-secret-fp.js` (a deliverable) is how
anyone reproduces these locally, and **Table C** is the checked-in, CI-assertable
form of the same facts.

**The vault is a live corpus, so every M-figure carries its measurement date.**
The 2026-07-25 round measured 181 notes; the vault gained one note overnight and
the 2026-07-26 re-measurement is what this document and ADR-0034 now state. A
later reproduction that differs because the vault has grown again is a
**re-measurement event** — the architect re-runs V-7 and files a dated errata
amendment in ADR-0034 — **not** a defect and **not** an implementer's problem.
Nothing an implementer runs touches the vault: V-15 greps files on disk, so vault
growth can never turn it red.

**Four canonical numeric surfaces, and they are pairwise disjoint.** Every
number in this document is decided in exactly one of them, and prose elsewhere
cites a row id rather than restating a figure.

| surface | decides | warrant | enforced by |
|---------|---------|---------|-------------|
| **Table A** | the detector's own constants — alphabets, lengths, the entropy floor, the filler bound and its character class, the separator set, the rule count | design decision | V-2, V-2b, V-2c, V-2d, V-2e, V-3, V-12 |
| **Table C3** | every figure the **test suite asserts** — corpus sizes, cell counts, catch rates, CI floors, id sets | measurement, frozen into CI | V-6 |
| **M1–M6, this section** | every figure **measured on a corpus that is not checked in** — the maintainer's private vault and the synthetic draws behind M3, M4a and M4b | measurement, reproducible on demand | V-7 (owner-run), V-15 |
| **Table L** | **the lookback arithmetic** — every binding row's keyword-to-candidate span, the resulting floor, what each literal below it breaks, and the value the shipped expression evaluates to | measurement against a from-spec prototype | **no V-step digests it SPECIFICALLY**, the way V-29 digests Table A row A8 — it is held by V-15's residue sweep, which is weaker than the other three surfaces' enforcement and is stated rather than glossed. **And the sweep's own region is what round 6 had to repair**: it excludes fenced ` ```bash ` blocks, and one of Table L's registered mirrors — V-2e's rationale — was living inside one, i.e. in the single region the enforcement structurally cannot reach. That prose is now in the Implementation notes. *Added in round 4; round 4's review found this table updated in the Contract-reference index and NOT here, one sibling surface apart; round 5's review found the enforcement claim itself unreachable* |

**No figure appears in two of them.** Nothing in M1–M6 is a C3 row; no C3 row
restates an M figure (M6 deliberately carries no number at all and defers to C3);
no Table A constant is re-derived in any of them; and **Table L owns the span
family outright — Table A owns the lookback's FORM (an expression over
`ScanLimits`), Table L owns its FIGURE.** A number that appears in a *fifth*
place — a criterion, a residual, a verification comment, a glossary entry — is a
defect on sight, whichever surface owns it. That drift, wearing four different
hats, was four of round 2's blocking findings.

**The same rule crosses the split line and the ADR line, and round 3 found three
places where it had not.** A figure this document does not own — leg 2's
retention cap, or a measurement stated in ADR-0034 — is cited **by owning row or
by section**, never restated. Concretely: the cap is **Table B row B12 of
`WP-secret-fence-ep2-redact-arm`**, and the allowlist's up-front approval count
is **ADR-0034's "Alternatives considered"**. You may name a row id of the other
leg; you may not open its file (the One-Document Rule, ADR-0005) and you may not
copy its number, because nothing here would ever catch it drifting.

**M1's and M5's headline figures are mirrored in ADR-0034** (its evidence blocks
E1 and E3), which is `Status: Accepted` and carries the owner's signature. That
mirror is not a duplicate left to rot: verification step **V-15** greps ADR-0034
for those exact figures, so an errata amendment to the ADR that moves one of them
turns this WP's verification red, and an edit here that moves one of them does
the same.

**ADR-0034 LANDED IN `7ef4c51` ON 2026-07-26. The dispatch blocker that stood
here is discharged, and the paragraph is deleted rather than softened.**
Earlier revisions of this document carried, in five places, the claim that
ADR-0034 "has never been committed" and that an implementer branching from
`main` would therefore hit a red V-11 and a red V-15 that they were forbidden to
repair. **Measured at the capture point (`cea31e0`, 2026-07-27):**
`git log --format=%H -1 -- docs/adr/0034-accidental-persistence-threat-model.md`
returns `7ef4c51`; that file's line 3 is `Status: Accepted`; its line 6 is the
owner's `OWNER-SIGNED 2026-07-25`; **V-11 passes in full**, signature digest
included, and **V-15 passes**. The same commit added both leg files. **The
paragraph had become self-referentially wrong in exactly the way it warned its
own predecessor had been** — that predecessor said the ADR "is on `main`" when it
was not; this one said it is not when it is.

**What that changes downstream, stated so nothing is left half-repaired.**
ADR-0034's errata ceremony rests on the ADR being "the durable record", and that
argument was being made about an uncommitted file; it is now a fact rather than
an intention, so the ceremony stands unqualified. **V-21's two digests and V-15's
block digests stop being pinned to the architect's working copy and become real
immutability checks against a committed baseline** — `git show 7ef4c51:<path>` is
now a diffable prior state for both the ADR and this spec. Definition-of-done
item 0 keeps its history check: it is cheap, it is the honest form of the
question, and it is what makes a *future* uncommitted-authority state visible
rather than assumed. Its failure instruction is unchanged — stop and report; no
agent commits an ADR or writes an `OWNER-SIGNED` line to clear a gate (S5).

**ADR-0034 is the hub.** The EP2-gate leg (`WP-secret-fence-ep2-redact-arm`) pins
the same two figures to the same ADR rather than to this document, so the two
legs cannot drift apart without at least one of them failing — and neither leg
has to read the other's spec to stay correct (the One-Document Rule, ADR-0005).

**M1 — where the false positives come from.** Every note in the vault, scanned
whole with the shipped detector:

```text
notes scanned                                    182
notes with ANY finding (EP2 reverts today)       102   (56.0%)
    high-entropy ONLY                            101
    a labelled rule ONLY                           0
    both                                           1   (a documented AKIA placeholder)
findings by rule:  high-entropy 299 occurrences  |  aws-key 1
distinct high-entropy runs                       106
```

**M2 — what those 106 runs are.** 102 of the 106 contain a `/`. Every one of
those 102 is a file path or a slash-joined prose list, and — this is the
discriminating fact — **not one of them has a single slash-free segment of 24+
characters.** The top of the frequency list:

```text
 62  "Projects/wienerdog/current"          19  "Projects/predictor/current"
 13  "Black/quant/autoresearch"            11  "Projects/wienerdog/marketing"
  9  "/Users/gyulafeher/Documents/Claude"   7  "deployment/daemon/trading"
  4  "/opt/homebrew/bin/claude"             4  "/Library/LaunchAgents/com"
```

A credential is high-entropy **within** one delimiter-free segment. A
**path-shaped** run is high-entropy only **across** its segments. "Path-shaped"
rather than "a path" on purpose: the void is a property of the *shape*, not of
the string being a filesystem path — C2 row 24 is a URL slug, and it carries a
32-character slash-free segment, which is why it is `redact` and not clean.
Today's alphabet already treats `-`
and `_` as delimiters (which is why base64url credentials are shredded and only
fire 74% of the time) but not `/` — and that inconsistency is the entire false
positive class.

**M3 — the cost of treating `/` as a delimiter.** Uniform draws from the 64-char
standard-base64 alphabet, bare token, N = 200 000, measuring how often the
slashes fragment the token below the 24-character floor:

| token length | escapes a slash-free `{24,}` rule |
|--------------|-----------------------------------|
| 24 | 31.67% |
| 32 | 23.04% |
| **40 (AWS secret access key)** | **14.46%** |
| 43 | 11.10% |
| 44 | 10.11% |
| 64 | 1.74% |

**A flat "drop `/` from the alphabet" is therefore rejected**: an AWS secret
access key is exactly 40 characters of standard base64 including `+` and `/`,
and it is one of the very few credential classes with **no prefix at all** —
independently confirmed, gitleaks' 222-rule default config has *no*
`aws-secret-access-key` rule; it is caught only through keyword context. Losing
14% of them is not acceptable. This is the design's central constraint, and it
is why the alphabet is split into two tiers rather than narrowed.

**M4 — the tier-2 context predicate.** Tier 2 keeps `/` but fires only in
sensitive context. Mere *proximity* is not good enough: measured on the real
vault, a keyword-within-N-characters predicate still quarantines real notes,
because prose puts sensitive words near paths.

| tier-2 predicate | notes quarantined |
|------------------|-------------------|
| keyword within 64 chars | 4 |
| keyword within 40 chars | 2 |
| keyword within 24 chars | 1 |
| keyword within 16 chars | 0 |
| **separator-bound, filler ≤ 20** | **0** |
| separator-bound, filler ≤ 40 | **0** |
| separator-bound, filler ≤ 64 | **0** |

**Corrected 2026-07-26 (round 3).** The `filler ≤ 40` cell read **1** in an
earlier revision. Re-measured on the same 182-note vault it is **0**, and so is
every bound from 16 to 64: on this corpus the filler bound discriminates
**nothing**, because the separator itself is what does the work. The wrong figure
has a traceable cause rather than being a transcription slip — it was measured
against the predicate *before* **M4b** narrowed A8's filler from "any non-newline
character" to gitleaks' `[ \t\w.-]`, and the row was never re-run afterwards.
Under the **wide** class the 1 reproduces exactly (see M4b), which is why the
error survived two rounds: the number was real, it just belonged to a different
predicate. The consequence for verification is stated in **M4e**, which is the
register of every clause A7 and A8 state: the vault holds **none** of them at any
setting, so each is held by a C2 row and a mutation instead — or, where nothing
holds it, M4e says so in words and gives the reason.

The four proximity false positives are `aud/iss/exp/verified/exact` (keyword
`token`, 25 chars away), `koltsegvetes/analysis/scripts/fetch` (`token`, 40),
`damaged/missing/broken/ok` (`refresh_token`, 15) and `/opt/homebrew/bin/claude`
(`credential`, 40). Shrinking the window to 16 would work on *this* corpus by a
one-character margin — exactly the "tuned to one sample" trap that produced the
predecessor's defects. **The separator-bound predicate has a structural reason
to hold instead of a numeric one: English prose does not put a `:` or `=` between
a noun and a path.** It is also gitleaks' own `generic-api-key` binding, at
gitleaks' own filler bound of 20 and entropy threshold of 3.5.

**M4 is under-powered as a gate on any *individual* separator, and this spec
does not claim otherwise.** The vault holds only 4 keyword-bearing table lines
out of 1 466, so "separator-bound → 0 notes quarantined" is a statement about
the predicate as a whole, not evidence that every member of `SEP` is safe. A
member whose false positives live in a shape the vault barely contains would
pass this table and still be wrong — which is exactly what happened to the
vertical bar, below.

**M4a — why the vertical bar is NOT in `SEP` (Table A row A8a).** An earlier
revision of this spec put a single `|` in `SEP` so that markdown-table context
would bind. Two things were wrong with it. (i) **It is not in the gitleaks rule
it was justified by.** The live `generic-api-key` separator group, fetched
2026-07-26 from `config/gitleaks.toml` line 640, is
`(?:=|>|:{1,3}=|\|\||:|=>|\?=|,)` — that is a *logical-or, two pipes*
(`\|\|`), not a single vertical bar. A single `|` was a Wienerdog addition
carrying gitleaks' name. (ii) **Measured, it reintroduces the destructive
outcome on ordinary documentation prose.**

Measured 2026-07-26 over this repository's own `docs/` tree, **excluding this
spec file** (311 markdown files, 91 596 lines on that date — this file is
excluded because its own worked examples are deliberate probes and would
otherwise be counted as prose; the tree grows as specs land, so reproduce the
*named lines* below rather than the totals):

| `SEP` | `quarantine` `high-entropy` LINES in `docs/` | which |
|-------|-----------------------------------------------|-------|
| as decided in A8a | **1** | `WP-secret-scan-whole-token-runs.md:650` — the accepted residual reproduced as **C2 row 32** |
| A8a **plus a single `\|`** | **3** | the same one, **plus** `WP-secret-scan-baseline-oracle.md:86` and `:87` |

The two added lines are ordinary documentation table rows:

```text
docs/specs/done/WP-secret-scan-baseline-oracle.md:86
  | `git hash-object src/core/secret-scan.js` | `eb273e19050037542c8beb441b8a320a3248b514` |
docs/specs/done/WP-secret-scan-baseline-oracle.md:87
  | `shasum -a 256 src/core/secret-scan.js` | `be54813a2602a78822e939663ab31c3eff16426148c81a9394c0afc821584167` |
```

The keyword is the `secret` inside `secret-scan.js`; the filler is `-scan.js`;
the separator is the cell wall; the candidate is a git hash. Neither was shaped
to trigger anything. **Corrected 2026-07-26:** an earlier revision of this block
claimed **three** bar-induced false positives and cited
`WP-secret-scan-baseline-oracle.md:367` as the third. Re-measured, that line
yields `redact`, not `quarantine` — its bars are markdown-escaped (`\|`), and a
backslash is not in A8's filler class, so the keyword never binds. The citation
was wrong; the decision it supported is not, and stands on the two lines above.

**The measured cost of removing it**, **N = 20 000**, seed `0xC0FFEE`, `table`
context `` `| token | <t> | ok |` ``. (C3-3 states the same three quantities at
**N = 2 000**, which is the suite's draw count and therefore the basis of its
floors; the two agree to within a tenth of a point and neither is derived from
the other.)

| fixture | with `|` in `SEP` | without |
|---------|-------------------|---------|
| `aws-secret-access-key` | 100% caught, `quarantine` | 85.6% caught, `redact` |
| `aws-secret-access-key-64` | 100% caught, `quarantine` | 98.4% caught, `redact` |
| `grafana-cloud-token` | 77.2% caught, `redact` | 77.2% caught, `redact` (unchanged) |

That cost is real and it is accepted: it makes `table` context behave exactly
like `bare` and `prose` for the prefix-free base64 class, which is already
accepted residual 1. The benefit is that the *destructive* outcome — the entire
subject of this WP — stops firing on documentation tables. **The vertical bar is
therefore not a member of `SEP`; Table A row A8a is where the whole set is
decided.**

**M4b — the filler class follows gitleaks exactly, and the narrowing is worth a
measured note.** gitleaks' filler between the keyword and the separator is the
restricted class `[ \t\w.-]{0,20}`. An earlier revision wrote "at most 20
non-newline characters", which is strictly broader in the false-positive
direction. Table A row A8 names gitleaks' class. Verified against the FN matrix:
no cell changes.

**Corrected 2026-07-26 (round 3): "for no measured gain" was wrong, and the
measurement is the better argument.** Re-run over the same 182-note vault, the
two classes are separated by exactly one note — and only once the bound is
loosened as well:

| A8 filler class | filler ≤ 20 | filler ≤ 40 |
|-----------------|-------------|-------------|
| **`[ \t\w.-]` (gitleaks', as decided in A8)** | **0** | **0** |
| `[^\n]` (the earlier revision's wording) | 0 | **1** |

The one note is a daily log. Its structure, which is all this document may print
of a private vault: keyword `credential`, then **37** filler characters
containing `(`, `"` and `)`, then the separator `:`, then a backtick, then a
24-character candidate carrying **4** slashes — a path-shaped run, i.e. exactly
the destructive class this WP exists to kill. **C2 row 36 is the sanitized
reproduction of that shape**, shortened so that it isolates the class from the
bound.

**M4e — the register of every clause A8 and A7 state, and what holds each one.**
M4's under-power caveat about individual separators applies with full force to
the whole context predicate: at the shipped setting *and* at every variation of
it the vault reaches 0, so **no vault measurement can tell a correct context
predicate from a loosened one**. That is a corpus gap, not a licence. Round 3
closed it on the checked-in side rather than by widening anything.

**What is mechanical here is RECONCILIATION, not completeness, and the
difference is the whole point of this paragraph.** Rounds 3 and 4 each found this
register incomplete, in the same way and for the same reason: it asserted "every
clause A7 and A8 state has a line here" in prose, and nothing made the assertion
true. Round 4's repair — a `[C]` marker per clause in A8, one per row here, the
two counts asserted equal — was itself a hand-written seed, and round 5 measured
it blind: an UNMARKED clause added to A8, and a second clause placed beside an
existing marker, each left both counts at 9 and every assertion green. The
markers are gone. **V-29 now pins Table A row A8 WHOLE and this table WHOLE, each
by digest (C3-18)**, and that mechanism is exactly as strong as what it actually
does: it makes any *edit* to either surface fail the build, so no future change
to A8's clauses or to this register can land without the architect reconciling
the pair in one disclosed pass.

**It does not, and cannot, prove the register complete as it stands today.** A
clause that is already in A8 with no row here would stay missing silently — the
digest pins the bytes it is given, and has no opinion about whether they agree.
Completeness of the pairing is still a human reading, performed once per round,
and round 5's reading is what added the case-insensitivity row and split the
quote-cardinality row below. That honest limit is recorded once, with the same
limit for every other register in this document, in **"Completeness registers and
what actually bounds each"** under the Contract reference — the register whose
input is derived is the only one that may claim completeness, and this is not it.
What follows is therefore a digested register: a change-detector with a
hand-checked baseline, not a promise and not a count.

| clause | held by | mutation |
|--------|---------|----------|
| the **keyword** (A7 = `SENSITIVE_KEYS` + `authorization`) | **nothing — deliberately unheld.** See below | none |
| the keyword match is **case-insensitive** | **C2 rows 29, 31 and 32**, whose keywords are the `Key` inside the `api[_-]?key` match on `apiKey`, the `TOKEN` of `API_TOKEN` and the `TOKEN` of `TOKEN_CHARS`; measured 2026-07-26, a case-sensitive binder drops all three from `quarantine` to `redact` and breaks **C3-5**'s equality in the main suite. Row 30's keyword is already lower-case and does not move | **M-42** |
| the filler **bound** (`ENTROPY_CTX_FILLER_MAX = 20`) | **C2 row 35**, `redact` at 20 and `quarantine` at 40 | **M-5** |
| the filler **character class** (`[ \t\w.-]`, not `[^\n]`) | **C2 row 36**, `clean` under A8 and `quarantine` under `[^\n]` | **M-13** |
| the quote/backtick **cardinality** — at most one on each side, `?` and never `*` | **both slots, and the pre-separator one stopped being unheld in round 1 of the design gate.** POST-separator: **C2 row 41**, `redact` under A8 and `quarantine` when that quantifier is `*`. PRE-separator: **C2 row 44**, `redact` under A8 and `quarantine` when the *pre-separator* quantifier alone is `*` — measured against a from-spec prototype on 2026-07-27, that isolated change moves row 44 and **no other row of the 44** | **M-39** quantifies both slots together and moves rows **41 and 44**; **M-44** quantifies the **pre-separator slot only** and moves row **44 alone** |
| the **optional whitespace** on each side of the separator — A8 states it twice, once between the pre-separator quote slot and the separator and once between the separator and the post-separator quote slot | **the main suite, through C3-5**, exactly like the case-insensitivity row above and needing no 35–44 control. Measured against a from-spec prototype on 2026-07-27: removing both allowances drops **every member of C3-5's id set** out of `quarantine` — read the set there — so the equality fails to the empty set. Row 31 (`API_TOKEN ?= Zx4…`) carries a space on **each** side of `?=` and is the cleanest single witness. *Added in round 1: A8 stated this clause and this register had no line for it, which is the eleventh clause and the seventh occurrence of the defect this register keeps re-finding* | none — a mutation row would duplicate what C3-5 already fails on. If one is ever wanted, its id comes from the orchestrator at write time |
| the separator **cardinality** — exactly one token, unquantified and never `+` | **C2 row 40**, `redact` under A8 and `quarantine` under `(?:${SEP})+` | **M-38** |
| the separator **token set** (`SEP`, A8a) — each member's adoption or exclusion | **C2 rows 26/27/28** (the bar), **29–31** (the adopted tokens), **33/34** (the excluded ones) and V-12's exact-line pin | **M-14, M-40, M-41, M-43** |
| the candidate **follows the separator directly** — optional whitespace and at most one quote/backtick, never filler | **C2 row 39**, `redact` under A8 and `quarantine` if filler is allowed there | **M-37** |
| **same line only** — the binder never crosses a `\n` | **C2 row 38**, `clean` under A8 and `quarantine` under a `\s*` binder | **M-36** |
| `hasBoundContext`'s **lookback**, derived from `ScanLimits` rather than written out | **C2 row 37**, whose binding span **Table L** decides — it exceeds the expression's shipped-bound value, so under M-5 it moves only if the lookback is derived — **and V-2e's exact-line pin** on the declaration | **M-5** |

The clauses are **mutually orthogonal, and that was measured rather than
arranged**: each mutation moves exactly the rows its own clause owns — M-5 moves
35 and 37, M-13 moves 36, M-36 moves 38, M-37 moves 39, M-38 moves 40, M-39
moves 41 **and 44**, M-44 moves 44 alone — and leaves every other row in 35–41
and 44 exactly where it was. That is what C3-12 … C3-17 and **C3-19** assert, as
exact multi-row outcomes rather than as "some row moves". **Re-measured whole on
2026-07-27** against a from-spec prototype carrying each mutation in turn, over
all forty-four rows, and the outcomes above are that measurement rather than a
reconstruction of the previous round's.
Rows 35–41 and 44 all reach `quarantine` under the *shipped* detector, so none of
them is a regression this WP introduces — all eight are outcomes it softens.

**Three clauses cost measured false positives when loosened and the rest do not,
and the register says which.** The filler bound and class are held on measured
vault evidence (M4b); the separator **cardinality** is held on a measured `docs/`
false positive (**M4f** — the loosened form quarantines an ordinary `==`
comparison in this repository's own documentation); the quote cardinality, the
same-line clause and the adjacency clause cost **zero lines** on `docs/` when
loosened (M4f, C3-14, C3-15) and are held because an unheld written contract
clause is a defect in its own right, not because a measurement demands it. That
distinction is stated so a later round does not mistake the second group for
padding — round 3 found two such clauses unheld, round 4 found two more, and
round 5 found two more again, every time in a register that claimed to be
complete. The register no longer claims it.

**The PRE-separator quote slot IS NOW HELD — round 1 of the design gate closed
it, and the closure is recorded here because the gap was recorded here.** A8
allows an optional quote or backtick on **each** side of the separator, and the
same `?`-not-`*` cardinality governs both. Until this pass only the
**post**-separator slot was held: row 41's two quote characters both sit after
the separator, and **M-39 quantifies both slots together**, so no corpus row
discriminated the pre-separator one.

**The previous revision named the exact follow-on and declined to do it, for a
reason that no longer applies.** It said the closure needed "a shape carrying a
keyword, two quote characters, the separator and a candidate, **executed**",
because C2's header requires every `Expect` cell to have been run against a
from-spec prototype rather than reasoned about — and the architect then had the
measurement but no prototype in hand. **This pass built the prototype**,
validated it by reproducing all forty-one existing `Expect` cells, and then
executed the new row. So the closure is:

- **C2 row 44** — the shape, executed: keyword `authorization`, **exactly 20**
  filler characters, then **two** quote characters (a backtick and a double
  quote) **before** the separator, then `:`, one space, and row 37's 24-character
  opaque id. `redact` under A8; `quarantine` when the pre-separator quantifier
  alone becomes `*`.
- **C3-19** — the assertion, an exact whole-group outcome like C3-12 … C3-17.
- **M-44** — the isolated mutation, changing **only** the pre-separator
  quantifier. Its id was **re-measured across both leg files in this pass, with
  both files in front of the architect and no agent writing to either**, which
  is the condition the id convention names; `M-44` was free and is now live, and
  **the next-free figure is decided once, in the id convention under
  "Verification steps", and is not restated here** — round 4 removed this exact
  restatement from M-44's cell and round 4's review found this copy still
  standing.
- **C3-0** (41 → 44, together with the two binder-residual rows) and **C3-6**'s
  id set, which gains 44.

**Why the filler is exactly 20 characters is the same trick row 40 uses, and it
was verified rather than assumed.** At exactly the bound, the widened filler
class of M-13 would need a 21st character to reach across the first quote, and
M-5's raised bound cannot help because neither quote character is in
`[ \t\w.-]` at any bound. Measured over all forty-four rows: row 44 moves under
**M-39** and **M-44** and under nothing else — not M-5, M-13, M-36, M-37, M-38,
M-40, M-41, M-42 or M-43.

**Its `docs/` cost is still zero**, measured 2026-07-26 and unchanged: `*` on the
pre-separator slot alone adds **0 lines** to M4f's sweep. So row 44 has the same
standing as rows 38, 39 and 41 — a written contract clause held because it is
written and was unheld, not because a measurement demands it. That distinction is
the one this register exists to keep visible.

**Why A7's keyword list is deliberately unheld, stated rather than left as a
gap.** A7 does not decide a keyword list; it **reuses the shipped
`SENSITIVE_KEYS` constant** and adds one word. Measured 2026-07-26, widening that
list with eight ordinary nouns keeps the entire suite green at **zero** measured
false positives on both the vault and `docs/` — so a corpus row could hold a
*narrowing* but not a widening, and a widening is not a failure mode this WP has
a reason to fear. What a widening *would* be is a change to a shipped constant
that this WP explicitly does not touch: A7's instruction is "reuse the constant;
do not write a second list", and a second list is visible in review as a new
literal in a five-line diff. That is the whole holder, it is a documentary one,
and it is named here rather than implied so that a later round finds a decision
instead of an omission. If A7 ever stops reusing the constant, it needs a row in
this table like every other clause.

**M4f — the two cardinality clauses, measured. One costs a real false positive
and one does not, and both were unheld until round 4.** A8 says "exactly one
separator TOKEN" and "an optional quote or backtick". Round 4 built both
violating implementations from this spec and measured them: `(?:${SEP})+` at the
use site, and a `*` quantifier on the two quote slots. **Neither is visible to
any structural check this document had.** Measured 2026-07-26 against a
from-spec module carrying each form, with the `SEP` and lookback declarations
byte-identical to the pinned lines: V-2's two alphabet pins, **V-2e**'s
`grep -cxF` on the lookback declaration and **V-12**'s two pins (`grep -cxF` on
the `SEP` line, and the one-occurrence pin on `:{1,3}=`) **all pass on all
three modules** — the conforming one, the multi-token one and the
unbounded-quote one. Nor did the corpus see them: before rows 40 and 41 existed,
neither form moved **any** of the 39 C2 rows, so the M-protocol could not
discriminate either.

The false-positive cost is where the two clauses part company. Measured with
M4a's method — a per-line sweep of this repository's `docs/` tree for
`quarantine`-severity `high-entropy` findings, excluding this spec file, 311
markdown files on 2026-07-26; the tree grows as specs land, so reproduce the
**named lines** rather than the totals:

| binder | `quarantine` `high-entropy` LINES in `docs/` | which |
|--------|----------------------------------------------|-------|
| A8 as decided | **1** | `WP-secret-scan-whole-token-runs.md:650` — the accepted residual, C2 row 32's shape |
| A8 with `(?:${SEP})+` (**many** separator tokens) | **2** | the same one, **plus** `docs/specs/done/WP-secret-scan-baseline-oracle.md:612` |
| A8 with `*` on the quote slots | **1** | the same one. **No line is added** |

The added line is ordinary documentation prose in a shipped, merged spec. **What
is shown below is the candidate SUBSTRING on that line, not the line** — the real
line 612 is a markdown table row beginning `| O5 | the successor's obligation | …`
that *contains* this fragment. The measurement and the decision are unaffected
(the line does carry the shape), and the distinction is spelled out because an
earlier revision presented the fragment as if it were the whole line:

```text
docs/specs/done/WP-secret-scan-baseline-oracle.md:612 — the candidate substring
  `git hash-object src/core/secret-scan.js == eb273e19050037542c8beb441b8a320a3248b514`
```

The keyword is the `secret` inside `secret-scan.js`; the filler is `-scan.js`;
the separator is `==`; the candidate is a 40-character git blob hash at 3.566
bits/char. Nothing here was shaped to trigger anything, and `==` is the equality
operator of most languages and of ordinary prose about them — this is a class,
not a line. **So the separator-cardinality clause is held on measured evidence,
exactly like the vertical bar in M4a**: C2 row 40 is its sanitized reproduction
and M-38 is its mutation.

**The quote-cardinality clause is held anyway, and the reason is stated rather
than assumed.** Its loosened form costs zero lines on `docs/` — the same
standing as the same-line clause (C3-14) and the adjacency clause (C3-15). It
gets C2 row 41 and mutation M-39 because a written contract clause with no
holder is the defect this register keeps re-finding, not because a measurement
demands it. Both of round 3's additions had exactly this shape and both were
right to add.

**Why C2 row 40 is a shortened reproduction rather than the measured line
itself**, which is M4b's move for row 36 and is deliberate here too. The real
line's filler is 8 characters, so a `[^\n]` filler class also reaches across the
first `=` and binds it — the line moves under **two** mutations and would hold
neither clause cleanly. Row 40 sets the filler at exactly the bound, which
leaves it unreachable under M-13 (a 21st filler character would be needed and
the bound is 20) and under M-5 (`=` is not in `[ \t\w.-]` at any bound), so it
moves under M-38 and nothing else. Measured: under `[^\n]` the same sweep adds
three lines rather than one, `WP-secret-scan-baseline-oracle.md:423`, `:424` and
`:612` — which is a strengthening of M4b's vault-side argument for the narrow
filler class, not a new decision.

**M4c — the separator is a TOKEN, not a character, and dropping gitleaks'
multi-character members costs real coverage for nothing.** An earlier revision of
A8 required *exactly one separator character* and kept only `:`, `=`, `>`. That
silently discarded four members of the group quoted in M4a — `:{1,3}=`, `=>`,
`?=` and `,` — and because a one-character rule cannot match a two-character
token, it discarded `=>` even though its component `>` was kept. Two of the
discarded forms are the ordinary assignment syntax of widely used languages.

Measured N = 20 000, seed `0xC0FFEE`, uniform standard-base64 value, from-spec
prototype. Cells are *any-finding % / `quarantine` %*:

| shape | today (shipped) | one-character `SEP` | A8a's token `SEP` |
|-------|-----------------|---------------------|-------------------|
| `apiKey := "<40>"` (Go) | 100 / 100 | 85.6 / **0** | 100 / 100 |
| `'secret_key' => '<40>'` (PHP, Ruby) | 100 / 100 | 85.6 / **0** | 100 / 100 |
| `API_KEY ?= <40>` (Make) | 100 / 100 | 85.6 / **0** | 100 / 100 |
| `secret: "<40>"` (control, one-character separator) | 100 / 9.7 | 100 / 100 | 100 / 100 |

A one-character `SEP` takes those three shapes from `quarantine` today to **no
finding at all** 14.4% of the time and to `redact` the rest — they lose the
destructive gate entirely. **The fix is measured at zero false-positive cost.**
Re-running every FP surface in this document with A8a's token set against the
one-character set:

| surface | one-character `SEP` | A8a's token `SEP` |
|---------|---------------------|-------------------|
| C2 corpus (rows 1–28) | 0 `quarantine` | 0 `quarantine` |
| real vault, 182 notes | 1 withheld / 9 scrubbed / 172 untouched | identical |
| repo `docs/`, 311 files | 1 `quarantine` line (M4a) | identical |

**The two gitleaks members A8a still excludes** — `,` and `\|\|` — are excluded on
structure, not on a measurement: adding either changes nothing on either corpus
(measured: 0 lines added on `docs/`, 0 notes moved on the vault), so M4's
under-power caveat applies to them exactly as it applied to the bar and the
conservative reading wins. **The reason for each is in the A8a disposition
table**, which is where every member's fate is decided; it is not restated here.

**M4d — `Authorization: Basic` would drop to nothing, which is why A16 exists.**
A8 requires the candidate to follow the separator directly; in
`Authorization: Basic <b64>` the word `Basic` and its space sit between them, so
the header binds no context and the credential falls to tier 1, where a standard
base64 body fragments on its slashes. Measured, N = 20 000, seed `0xC0FFEE`,
uniform standard base64 (which a Basic credential is), *any-finding % /
`quarantine` %*:

| body length | today (shipped) | tiering, no A16 rule | tiering **with** A16 |
|-------------|-----------------|----------------------|----------------------|
| 24 | 100 / 100 | 68.9 / 0 | 100 / 100 |
| 40 | 100 / 100 | 85.6 / 0 | 100 / 100 |
| 44 | 100 / 100 | 90.0 / 0 | 100 / 100 |

So without A16 the credential produces **no finding at all** 31 / 14 / 10% of the
time — `redactOnly` does not scrub it at EP1/EP3, EP2 does not withhold, EP4 does
not omit. `Authorization: Bearer <b64>` is unaffected (the shipped `bearer-token`
rule matches it at 100%); it is specifically `Basic` that has no rule. This is a
**named, published format** — gitleaks carries it as the `Basic` arm of
`curl-auth-header` (`config/gitleaks.toml:361`,
`Authorization:[ \t]{0,5}Basic[ \t]([a-z0-9+/]{8,}={0,3})`) — so a change that
stops catching it is a class-(a) finding under ADR-0034's review criterion. A16
is the labelled rule that closes it: purely additive, no character-class
suppression, and measured at 100% `quarantine` in all four C1 contexts (C3-4).

**One deliberate divergence from that citation: A16 writes `={0,2}` where
gitleaks writes `={0,3}`.** Base64 padding is at most two `=` characters — a
3-byte group encodes to 4 characters with no padding, 2 bytes to 3 + one `=`,
1 byte to 2 + two `=` — so `={0,3}` accepts a string base64 cannot produce.
`={0,2}` is correct and loses nothing; do not "align" it upwards.

**M5 — the whole design, end to end, on the real vault.** Labelled rules at
Table A severities plus both entropy tiers:

```text
                          today      proposed
notes WITHHELD              102             1     <- the pre-existing AKIA placeholder note
notes SCRUBBED in place       0             9
notes untouched              80           172
```

The one remaining withheld note fires on the **labelled** `aws-key` rule, fires
today too, and is not affected by this WP.

**M5a — what M5 means for THIS leg, which ships alone.** M5's `proposed` column
is the end state **after both legs**. This WP ships the detector only and leaves
EP2's `findings.length > 0` condition untouched (see "The interim behaviour"), so
in the interim the withheld row and the scrubbed row are the **same**
disposition: a revert. **This block is the only place in this document that
states the interim figure.**

```text
                          today    after THIS leg    after both legs
notes REVERTED by EP2       102                10                  1
notes SCRUBBED in place       0                 0                  9
notes untouched              80               172                172
```

**10 is a derivation, not a new measurement**: it is M5's withheld count (1) plus
M5's scrubbed count (9), because EP2 cannot yet tell those two apart. The
`untouched` column is identical in the last two columns because it is the
*tiering* that stops the entropy pass firing, not the gate — which is exactly why
this leg is the one that carries the product improvement and leg 2 only chooses
what to do with what is left.

**M6 — the FN regression matrix.** The C1 credential fixtures × the four
contexts, N = 2 000 draws per cell, comparing today's shipped detector against
the proposed one. **The fixture count, the cell count, the per-cell rates, the
exact set of regressing cells and their floors are decided in Table C and are
restated nowhere else in this document.** Four separate round-2 findings were
prose counts that had drifted from the table, so this paragraph deliberately
carries no number.

Qualitatively, and this is the part worth reading in prose: regressions occur
**only** in `bare`, `prose` and `table` context, **never** in `assign`, and only
for credential formats whose entropy-visible tail is drawn from an alphabet
containing `/`. Those fixtures are marked in Table C1. `assign` never regresses,
because a sensitive-key assignment either binds tier 2 (A5) or matches a
labelled rule outright.

**The regression scales roughly as 1/length**, which is why C1 carries each
affected published format at its *minimum* published length: a 30-character
authress tail and a 32-character Grafana `glc_` body lose tens of points, while
the long-bodied slash-bearing formats lose ≤ 0.04% and are deliberately **not**
in C1 — a fixture whose measured delta rounds to zero pads the matrix without
testing anything. Measured, not assumed: all three were generated and run before
being left out. The three, **with their rule ids re-verified against
`config/gitleaks.toml` on 2026-07-26** (an earlier revision of this sentence
named two rules that do not exist — `alibaba-ABSK` and `fastmail-fm2` — and the
citations were its only warrant, so they are corrected here):
`1password-service-account-token` (`ops_eyJ` + `[a-zA-Z0-9+/]{250,}`, line 79),
`aws-amazon-bedrock-api-key-long-lived` (`ABSK` + `[A-Za-z0-9+/]{109,269}`,
line 223) and `flyio-access-token` (`fm2_` + `[a-zA-Z0-9+/]{100,}`, line 582).

**Honest divergence from the numbers this spec was originally handed.** The
brief claimed a bare-proximity tier-2 predicate reached "0 notes quarantined";
it does not — M4's table is the reproduction, and it is what motivated the
separator-bound predicate, which does reach 0. (A second divergence, in how
runs were classified as path/wikilink/URL, was a classifier heuristic
difference with identical totals and is not carried forward.)

## Deliverables (permission boundary — touch ONLY these)

<!-- This spec file itself and package-lock.json are always exempt. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/core/secret-scan.js | one canonical alphabet declaration; two derived tiers; the separator-bound context predicate; the severity-escalating `add` closure; every labelled rule at `quarantine` (**Table A**) |
| create | tests/fixtures/secret-corpus.js | the credential fixture generators (**Table C1** — one generator per row of that table, and no others) and the FP corpus (**Table C2** — one entry per row, in order, ids matching). Data + pure functions, no assertions. **Counts are asserted against Table C3 row C3-0, not hard-coded here** |
| create | tests/unit/secret-fence.test.js | the tier-agreement closure, the FN regression matrix, the FP ceiling, the severity-escalation case, the mutation checks |
| modify | tests/unit/secret-scan.test.js | ONLY the severity expectations **Table A** changes (lines 39, 55, 87, 95, 112, 119, 123, 140, 153), the entropy-pass assertions at 182–183, and **line 174** — that test's *name* is `'entropy: an unlabelled high-entropy base64 run is quarantined'` and after A6 it asserts `redact`, so the name is now false; rename it to say `is redacted` and change nothing else on that line |
| create | scripts/measure-secret-fp.js | offline, opt-in, takes a vault path argument; **not** run by `npm test`; reproduces M1/M5 |
| modify | docs/GLOSSARY.md | the **secret scan / `scanAndRedact`** entry, and within it **only the detector sentences** — see "The glossary edit, exactly" below. The gate sentences in that entry and the whole **secret quarantine** entry are leg 2's and must not be touched |

**Do not create, modify or delete anything else.** In particular, and this list
is exhaustive rather than illustrative:

- **not `src/core/dream/validate.js`** — the EP2 gate is leg 2
  (`WP-secret-fence-ep2-redact-arm`). Touching it here is the ordering violation
  described under "Why leg 2 cannot go first";
- **not `src/core/digest.js`**, not `src/cli/dream.js`, not `src/cli/sync.js`,
  not `src/core/transcripts/index.js`, not `src/core/alerts.js`, not
  `src/core/dream/brain.js`, not `src/cli/run-job.js`, not
  `src/core/run-evidence.js` — the EP1/EP3/EP4 call sites keep their code even
  though their *output* changes (Table A row A14, AC-17);
- **not `tests/unit/dream-validate.test.js`** and **not
  `tests/unit/digest.test.js`** — they must pass unmodified (AC-20). If one does
  not, stop and report a spec bug;
- **not `docs/runbooks/secret-incident.md`** — leg 2;
- **not `docs/adr/*`**, not `docs/specs/*` other than this file, and not
  `docs/specs/logbook/*`.

**Every one of those prohibitions is machine-checked**, including the glob-shaped
last bullet, because V-14's enforcer is `scripts/boundary-check.js` — it parses
this table and rejects any changed path that is not in it, so "forbidden in prose"
and "checked" are the same set by construction. V-14 feeds it a changed set built
from the **merge base to the working tree, plus untracked files**; see V-14 for
why that phrasing is load-bearing.

### The glossary edit, exactly

`docs/GLOSSARY.md` lines 72–83 hold the **secret scan / `scanAndRedact`** entry.
It currently ends with two sentences about the *gates*. Reproduced below **byte
for byte, with the file's own line breaks and leading indentation** (the tail of
line 77 through line 82) — an earlier revision reflowed this quotation while
instructing you to leave the text byte-unchanged, which is a contradiction:

```text
 Two
  severities, `redact` and `quarantine`, but the *persistence* gates (staged
  output, digest section) withhold on **any** finding of either severity; the
  input and log/alert paths use `redactOnly` (inline redaction of every
  match). `hasHardFinding` (quarantine-severity only) is an exported helper
  for future gates; no shipped gate branches on it today.
```

**Both of those sentences are still true after this WP and must be left
byte-unchanged** — EP2 still keys on `findings.length > 0` and `hasHardFinding`
still has no caller in `src/`. Leg 2 is what makes them false, and leg 2 is what
rewrites them. V-19 asserts you left them alone.

Your edit is an **insertion**, immediately after the existing sentence "…a
finding never stores the matched secret bytes." and immediately before "Two
severities, …". Write it in the glossary's existing voice; it must say this and
no more:

- the labelled format rules **all** emit `quarantine` severity (Table A row A10);
- behind them sits a **two-tier entropy pass**: a long enough run drawn from the
  narrow alphabet, at or above the entropy floor, is `redact` and needs **no
  context at all** (A6); the same run widened to include `/` is `quarantine`
  **only** when a sensitive keyword binds to it through a separator on the same
  line (A5, A8);
- both tiers write the same `[REDACTED:high-entropy]` token (A9).

**Put no number in the glossary** — not a rule count, not a length, not a floor,
not a rate. The entry carries none today and must carry none after. Numbers are
decided in Table A (the detector's constants) and Table C3 (the asserted
acceptance numbers); the glossary is a naming document.

### Exact contracts

#### `src/core/secret-scan.js`

```js
/** The ONE declaration of the entropy candidate alphabet. Tier 2 is Tier 1 plus
 *  `/`; both regexes are DERIVED from these two constants and are never written
 *  out by hand. `-` and `_` are absent from both, deliberately and as today. */
const ENTROPY_CORE_CLASS = 'A-Za-z0-9+=';
const ENTROPY_WIDE_EXTRA = '/';

/** The ONE declaration of the separator TOKEN set — Table A row A8a decides its
 *  members; this line only spells them. Ordered LONGEST-FIRST as a DEFENSIVE
 *  convention, not because the current predicate needs it: `hasBoundContext`'s
 *  regex is END-ANCHORED, so when `[:=>]` matches the `=` of `=>` the trailing
 *  `$` fails and the engine backtracks into the two-character alternative.
 *  Measured 2026-07-26: a shortest-first spelling produces ZERO C2 mismatches.
 *  The order becomes load-bearing the moment the alternation is used anywhere
 *  the anchor does not force that backtrack — a forward scan, a `g`/`y` match,
 *  or a `SEP` reused outside this one predicate — so keep it. Do NOT reorder,
 *  and do NOT claim in review that reordering is a fail-open bug; it is not.
 *  The vertical bar is deliberately absent (M4a), and so are gitleaks' `,`
 *  and `||` (M4c).
 *  Written as a regex literal + `.source` rather than a quoted string so the
 *  parser checks it and so it carries ONE backslash, not two — the string form
 *  needs `'\\?='` and the doubling is a standing transcription hazard.
 *  Interpolated into `hasBoundContext`'s regex inside `(?: … )`, exactly once. */
const SEP = /:{1,3}=|=>|\?=|[:=>]/.source;

/** True iff a sensitive keyword BINDS to the candidate starting at `idx`.
 *  Implements Table A rows A7, A8 and A8a EXACTLY — that table decides the
 *  keyword list, the filler bound and the separator set; this function does not
 *  get to differ from it. Same line only: the search never crosses a `\n`.
 *  @param {string} text @param {number} idx @returns {boolean} */
function hasBoundContext(text, idx) {
  // THE SLICE SITE. These two lines are canonical and V-2e pins both of them
  // whole; everything below them is the implementer's, subject to Table A row
  // A8. `CTX_LOOKBACK_MAX` is DECLARED once at module scope — the declaration
  // is in the Implementation notes and is deliberately not copied here, because
  // it carries two constants this section does not own.
  // The first line is the ONLY place `CTX_LOOKBACK_MAX` is read, which is what
  // makes the declaration load-bearing rather than decorative (mutation M-52).
  // The second is A8's same-line clause (mutation M-36).
  const back = text.slice(Math.max(0, idx - CTX_LOOKBACK_MAX), idx);
  const line = back.slice(back.lastIndexOf('\n') + 1);
  // … the A7/A8/A8a binder runs against `line`, end-anchored.
}

/** A16: `Authorization: Basic <base64>`. The one published credential class the
 *  tiering would otherwise stop catching at all (M4d). Placed as the FIRST rule
 *  of the A5 additive block — i.e. immediately AFTER the legacy assignment rule
 *  and immediately BEFORE the JSON-value rule — so the legacy WP-008 pipeline
 *  stays byte-compatible for every input it already covered. */
(text, add) =>
  text.replace(/\b(authorization:[ \t]*basic)[ \t]+[A-Za-z0-9+/]{8,}={0,2}/gi, (_m, kw) => {
    add('basic-auth', SEVERITY.QUARANTINE);
    return `${kw} [REDACTED:basic-auth]`;
  }),
```

**THE SLICE SITE IS A CONTRACT.** The three lines above are canonical and V-2e
pins each of them whole. **Why it is a whole-line pin, what the round-7 form was,
what it scored against mutation M-52 and why a count cannot tell a read from a
mention are stated once, in the Implementation notes**, under "Why V-2e is a
whole-line pin" — a registered Table L mirror. *This paragraph was a FOURTH copy
of that rationale until round 9, unregistered and carrying its own figure for the
round-8 measurement; the figure disagreed with the other three surfaces stating
the same measurement. It is a pointer now, and it carries no figure at all.*

`ScanLimits` gains exactly one field: `ENTROPY_CTX_FILLER_MAX: 20`.

`entropyPass(text, add)` is replaced by a single `text.replace` over the **tier-2**
regex whose callback receives `(candidate, offset)`:

```js
function entropyPass(text, add) {
  return text.replace(TIER2_CANDIDATE, (cand, offset) => {
    if (bitsPerChar(cand) >= ScanLimits.ENTROPY_MIN_BITS_PER_CHAR && hasBoundContext(text, offset)) {
      add('high-entropy', SEVERITY.QUARANTINE);
      return '[REDACTED:high-entropy]';
    }
    return cand.replace(TIER1_CANDIDATE, (sub) => {
      if (bitsPerChar(sub) < ScanLimits.ENTROPY_MIN_BITS_PER_CHAR) return sub;
      add('high-entropy', SEVERITY.REDACT);
      return '[REDACTED:high-entropy]';
    });
  });
}
```

Three properties of that shape are load-bearing; do not "simplify" any of them.
(1) The tier-1 scan runs **unconditionally** on every non-quarantined candidate,
never gated on the tier-2 bits check — entropy is not monotone, so a low-entropy
wide run can contain a high-entropy narrow sub-run. (2) `offset` is the tier-2
candidate's offset in `text`, which is what `hasBoundContext` needs; sub-runs do
not get their own context check (only under-escalation is possible, and an
under-escalated hit is still scrubbed). (3) `hasBoundContext` must be built from
a fresh non-global regex or must reset `lastIndex`; a module-scoped `g` regex
here intermittently skips content.

**`severityForKey` and `QUARANTINE_KEYS` are deleted** (they become constant
functions — see Table A). Every `RULES` call site passes `SEVERITY.QUARANTINE`.

**The `add` closure escalates severity (Table A row A15).** Today
`scanAndRedact`'s `add` (`secret-scan.js:211–215`) keys `findings` by label and,
on a repeat, does `existing.count += 1` and **nothing else** — the severity of
the *first* occurrence owns the label for the whole scan. That was harmless while
every label had exactly one severity. It stops being harmless the moment A5 and
A6 make `high-entropy` emit at two severities, because the two arms then race:

```text
authorization: wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY9c
call generateCodeVerifierAsync before the redirect
  -> [{label:'high-entropy', severity:'quarantine', count:2}]   hasHardFinding = true    CORRECT

call generateCodeVerifierAsync before the redirect
authorization: wJalrXUtnFEMIK7MDENGbPxRfiCYEXAMPLEKEY9c
  -> [{label:'high-entropy', severity:'redact',     count:2}]   hasHardFinding = false   WRONG
```

Reproduced against a from-spec prototype on 2026-07-26. Both lines are ordinary:
the benign carrier is this spec's own C2 row 15, and 9 of the maintainer's 182
vault notes already contain that carrier prose.

**Why A15 is in THIS leg even though nothing branches on severity yet.** Under
this WP alone the misordering is harmless: EP2 keys on `findings.length > 0`, so
a note reporting `redact` instead of `quarantine` is withheld either way. It
stops being harmless the moment the EP2 gate lands
(`WP-secret-fence-ep2-redact-arm`), and then it is **fail-open**: a note
containing a genuine bound-context secret would take that gate's redact arm —
scrubbed and *committed*, with no withhold, no banner and no transcript deferral
— purely because the benign carrier line happened to come first in the file.
That is why A15 ships with the detector rather than with the gate, and why the
gate leg checks for it before writing a line of code. Latent today (0
misroutings on the current vault), firing on the first note that mixes the
two.

Required change, exactly:

```js
const add = (label, severity) => {
  const existing = findings.get(label);
  if (existing) {
    existing.count += 1;
    // A15: severity is the MAXIMUM over a label's occurrences, never the first.
    if (severity === SEVERITY.QUARANTINE) existing.severity = SEVERITY.QUARANTINE;
  } else findings.set(label, { label, severity, count: 1 });
};
```

**Why escalate rather than split the label into two.** Splitting (`high-entropy`
for tier 2, a second label for tier 1) was considered and rejected: A9 fixes the
replacement token at `[REDACTED:high-entropy]` for both tiers, so a second label
either breaks that byte contract or produces a label that never appears in the
text it labels; and the label leaks into the user-visible revert reason string
(`validate.js`, "matched a secret pattern (<labels>)"), the dream report, and
`docs/GLOSSARY.md`. Escalation is one line, changes no surface, and states an
invariant that is correct for every label rather than a special case for one.
It is also monotone in the fail-closed direction: severity can only rise.

## Contract reference

**Activation (ADR-0031, 4 of 7):** (ii) the severity taxonomy changes meaning —
`redact` goes from "one of two labels nothing branches on" to a severity with
exactly one producer, which the next leg's gate will act on; (v) an authority
boundary — this WP's detector *emits* severity, and `src/core/dream/validate.js`
(leg 2, `WP-secret-fence-ep2-redact-arm`) *owns its interpretation*, so the
emitting side must be pinned before the consuming side exists; (vi) multiple
downstream consumers and a successor spec inherit the contract (EP1, EP3, EP4,
and leg 2); (vii) the same facts appear in the detector, the fixture corpus, the
fence tests, the glossary and this spec.

| Family | Canonical table | Nothing else decides it |
|--------|-----------------|-------------------------|
| what the detector emits | **Table A** | alphabets, floors, the context predicate, the severity of every label |
| what "correct" means | **Table C** | the fixture corpora and the exact acceptance numbers |
| the lookback arithmetic | **Table L** | every binding row's span, the resulting floor, and what each literal below it breaks. **Extracted in round 4 of the design gate after three consecutive rounds of findings on this family.** Table A owns the lookback's *form* (an expression over `ScanLimits`, never a result); Table L owns its *figure*, which is derived from C3-5's id set — the split that let a Table-C-only change leave the figure stale while every Table A check stayed green |
| what EP2 does with a finding | **not decided here** | **Table B of `WP-secret-fence-ep2-redact-arm`.** This WP changes no gate and states no disposition. If you find yourself needing to know what EP2 does with a `redact` finding in order to finish this WP, you have crossed the split line — stop |

### Table A — canonical: the detector contract

| # | Fact | Value |
|---|------|-------|
| A1 | canonical alphabet declaration | `ENTROPY_CORE_CLASS = 'A-Za-z0-9+='`, `ENTROPY_WIDE_EXTRA = '/'`. Both regexes are built from these; **no other character class literal may appear in the entropy pass** |
| A2 | tier-1 candidate | `[<CORE>]{24,}` — `ENTROPY_MIN_LEN` unchanged at 24 |
| A3 | tier-2 candidate | `[<CORE><WIDE_EXTRA>]{24,}` — exactly today's `[A-Za-z0-9+/=]{24,}` |
| A4 | entropy floor, both tiers | `ENTROPY_MIN_BITS_PER_CHAR = 3.5`, unchanged |
| A5 | tier-2 fires | candidate ≥ floor **AND** `hasBoundContext` → severity **`quarantine`**, whole candidate replaced |
| A6 | tier-1 fires | any sub-run of a non-quarantined tier-2 candidate, ≥ 24 chars, ≥ floor → severity **`redact`**, that sub-run replaced. **No context required** — a bare pasted key with no keyword near it is exactly the accidental case, and it must still be scrubbed |
| A7 | context keywords | the existing `SENSITIVE_KEYS` constant (lines 42–43) plus `authorization`. **Reuse the constant; do not write a second list** |
| A8 | context binding — **eleven clauses, each with a line in M4e naming what holds it, or recording that nothing does. This row and the M4e register are each pinned WHOLE, by digest, in V-29 (C3-18): a clause added here moves the row's digest whether or not anybody flags it, and the register is reconciled in the same pass. The digest detects the change; the pairing itself is still a human reading — see "Completeness registers and what actually bounds each"** | a keyword from row A7, matched **case-insensitively** (`SENSITIVE_KEYS` is spelled entirely in lower case and every shipped rule consuming it carries the `i` flag, so a case-sensitive binder silently stops binding `apiKey`, `API_TOKEN` and `TOKEN_CHARS` — C2 rows 29/31/32, mutation M-42), then at most `ENTROPY_CTX_FILLER_MAX` (= 20) characters from the class `[ \t\w.-]` (gitleaks' own filler class — space, tab, word character, dot, hyphen; **not** "any non-newline character", which is strictly broader in the FP direction for no measured gain, see M4b), then **at most one** quote or backtick — the quantifier is `?` and never `*`; the same clause governs the second quote slot below, a `*` on the *post*-separator slot binds ordinary backticked-JSON documentation prose (M4f, C2 row 41) and a `*` on **this** slot alone binds C2 row 44, then optional whitespace, then **exactly one** separator TOKEN — the token is not quantified at all, and never `+`; `(?:${SEP})+` at the use site leaves the `SEP` declaration byte-identical and every structural grep green while it binds an ordinary `==` comparison in documentation (M4f, C2 row 40) — drawn from the set `SEP` in row A8a, itself a token of one to four characters rather than one character, then optional whitespace, then at most one quote or backtick (same clause as above), then the candidate, which follows the separator **directly**: nothing but those optional whitespace and quote characters may sit between them. Same line only — the search never crosses a newline. The backwards slice the implementation takes is **derived from `ScanLimits`**, never written as a literal (Implementation notes; V-2e pins the declaration, C2 row 37 under M-5 holds it behaviourally) |
| A8a | `SEP`, the separator token set | **This row, not any code block, decides the set.** `SEP` is gitleaks' `generic-api-key` separator group (`config/gitleaks.toml:640`, fetched 2026-07-26: `` (?:=\|>\|:{1,3}=\|\|\|\|:\|=>\|\?=\|,) ``) **minus `,` and minus `\|\|`**, and the disposition of **every** member is recorded in the table below — a member dropped without a word is how an earlier revision lost Go and PHP assignment syntax. The regex-source form is `` :{1,3}=\|=>\|\?=\|[:=>] ``, **ordered longest-first**. That order is **defensive, not load-bearing today**: `hasBoundContext`'s regex is end-anchored, so a one-character alternative that swallows the first character of a two-character token fails the anchor and the engine backtracks into the longer form. Measured 2026-07-26, a shortest-first spelling produces **zero** C2 mismatches. Keep the order anyway — it stops being cosmetic anywhere the anchor does not force the backtrack — but V-12 pins the exact line, and the pin, not the ordering, is what makes A8a's membership a gate. Measurement for every row: M4a (the bar) and M4c (everything else) |
| A9 | replacement token | `[REDACTED:high-entropy]` for both tiers — unchanged |
| A10 | severity, every labelled rule | **`quarantine`**, without exception — the 18 shipped rules and the one A16 adds, 19 in all. Raised from `redact` at lines 96–102, 106, 111, 119, 148–150, 152 and via `severityForKey` at 131/142 |
| A11 | `severityForKey`, `QUARANTINE_KEYS` | **deleted** — with A10 they are constant |
| A12 | severity, `oversized` / `scan-error` | `quarantine`, unchanged |
| A13 | the only producer of `SEVERITY.REDACT` | the tier-1 arm (A6). Exactly one `add(…, SEVERITY.REDACT)` call site in the module |
| A14 | `redactOnly`, `hasHardFinding`, `scanAndRedact` **signatures** | unchanged — no parameter, no return shape, no export changes. **Their OUTPUT is not unchanged, and this WP does not claim it is:** `redactOnly(t) === scanAndRedact(t).text`, and A6 replaces fewer runs than today's context-free pass, so every `redactOnly` caller (EP1, EP3) sees strictly *less* redaction, and EP4, which keys on `findings.length > 0`, sees strictly *fewer* findings and therefore omits strictly fewer digest sections. Measured: `redactOnly('see Projects/wienerdog/current for detail')` is `'see [REDACTED:high-entropy] for detail'` today and byte-unchanged input under this WP; `findings.length` goes 1 → 0. **This loosening is intended and is the point of the WP; it is asserted by AC-17, not assumed.** No code in EP1/EP3/EP4 changes |
| A15 | `add`'s severity rule | **severity is the MAXIMUM over a label's occurrences, never the first.** `add(label, severity)` on an existing label increments `count` **and** raises `severity` to `quarantine` if this occurrence is `quarantine`. Required because A5 and A6 make one label (`high-entropy`) emit at two severities; without it the arm that fires first in the text owns the severity for the whole scan and `hasHardFinding` becomes order-dependent. Monotone and fail-closed: severity only ever rises |
| A16 | the **nineteenth** labelled rule — `Authorization: Basic` | label `basic-auth`, severity `quarantine`, pattern and placement exactly as in "Exact contracts". Added because A8 cannot bind it (the word `Basic` sits between the separator and the candidate) and tier 1 fragments a standard-base64 body, so without it the credential produces **no finding at all** a measured 10–31% of the time — a class-(a) regression against a published format (`curl-auth-header`'s `Basic` arm in gitleaks). Measurement: **M4d**. Purely additive: it suppresses nothing, matches no input the shipped detector already labelled, and is the one prefix rule this WP adds — every other missing prefix stays out of scope |

### A8a — the disposition of every member of gitleaks' separator group

Canonical detail for Table A row A8a. gitleaks' group has eight members; each one
is adopted or excluded here, with the reason and the surface that holds it.

| member | in `SEP`? | why | held by |
|--------|-----------|-----|---------|
| `:` `U+003A` | **yes** | `secret: <v>`, YAML, HTTP headers | AC-3, C2 rows 26/27 |
| `=` `U+003D` | **yes** | `.env`, shell, `KEY=<v>` | AC-3, C1 `assign` context |
| `>` `U+003E` | **yes** | gitleaks member; adopted for parity and for nothing else. **The asymmetry with `,` and `\|\|`, which are also gitleaks members and are excluded, is deliberate:** each of those two collides with an ordinary non-assignment shape — English sentence punctuation, and a compact markdown table's empty cell — which is what tipped the conservative reading against them; `>` collides with neither, so that reading never reaches it. It has **no corpus row of its own**, and removing it is measured null on both false-positive surfaces (0 lines moved on `docs/`, 0 notes moved on the vault, M4c) — so nothing here is being defended against a measurement; it is parity, held documentarily | AC-3 only — **no C2 row**, deliberately, per the cell to the left |
| `:{1,3}=` (`:=`, `::=`, `:::=`) | **yes** | Go short variable declaration, Make `::=`. Without it a Go `apiKey := "<v>"` goes from `quarantine` today to **no finding** 14.4% of the time and `redact` otherwise (M4c) | **C2 row 29**, mutation **M-40** |
| `=>` | **yes** | PHP array / Ruby hash entry. Same measured cliff as `:=`. Note it cannot bind under a one-character rule *even though `>` is a member* — the token is two characters (M4c) | **C2 row 30**, mutation **M-40** |
| `?=` | **yes** | Make conditional assignment | **C2 row 31**, mutation **M-40** |
| `,` `U+002C` | **NO** | the only member that is also ordinary English punctuation: "the session token, `<24 base64 characters>`, expires on Friday" would bind, and that is prose, not an assignment. Adding it changes nothing measurable on either corpus (M4c), so the conservative reading wins | **C2 row 33** must stay `redact`, mutation **M-41** |
| `\|\|` (two pipes) | **NO** | targets `x = y \|\| "<secret>"` fallback expressions in source code; nil benefit for an accidentally *pasted* credential, and `\|\|` is the empty-cell sequence of a compact markdown table — the shape whose single-bar sibling M4a measured as destructive (M4c) | **C2 row 34** must stay `redact`, mutation **M-43** |
| a single `\|` `U+007C` | **NO**, and it was never a gitleaks member | **Anyone re-deriving `SEP` from gitleaks will see `\|\|` and must not read it as a single bar** — that is a logical-or, two pipes. A single bar was a Wienerdog addition carrying gitleaks' name; measured, it produces destructive `quarantine` false positives on ordinary documentation tables (M4a) | **C2 rows 26/27**, mutation **M-14** |

**Why A10 is in this WP rather than deferred to the gate leg.** A10 is inert
today — nothing in `src/` branches on severity — so it could look like it belongs
with the gate that will read it. It does not. Once the EP2 gate branches on
severity (`WP-secret-fence-ep2-redact-arm`), sixteen labelled rules still sitting
at `redact` would silently convert from "withhold the note" to "scrub and commit"
— a loosening of ADR-0024's ratified behaviour that neither leg intends and that
no measurement supports. Landing A10 **with the detector** means the gate leg
inherits a detector in which `redact` has exactly one producer, and can verify
that with a single grep instead of trusting a list of sixteen rules. Its measured
cost is M1's labelled-rule column: one finding across the whole vault, on a
documented `AKIA…` placeholder.

### Table C — canonical: the corpora and the acceptance numbers

#### C1 — the credential fixtures (`tests/fixtures/secret-corpus.js`)

**39 generators**, derived from the gitleaks default `config/gitleaks.toml`
(222 rules; re-read from `master` on 2026-07-26). Each is `(rng) => string` and
draws from an explicit alphabet — **no literal sample tokens**, because a single
fixture passes while a rule leaks 14%, which is precisely the defect that
produced the wrong claim this spec had to correct. **This table is the only
place the fixture count is decided; every other surface says "the C1 fixtures".**

Two columns carry facts the acceptance numbers depend on:

- **`/`?** — does the fixture's entropy-visible tail draw from an alphabet
  containing `/`? Only a `yes` fixture can regress under A2/A3.
- **labelled?** — does a Wienerdog *labelled* rule (not the entropy pass) match
  this format at 100% in all four contexts? Measured 2026-07-26, N = 2 000. This
  column, not prose, is what C3-4 and accepted residual 2 read.

| fixture id | construction | `/`? | labelled? |
|------------|--------------|------|-----------|
| `anthropic-api-key` | `'sk-ant-api03-' + 93×[A-Za-z0-9_-] + 'AA'` | no | yes |
| `openai-legacy` | `'sk-' + 20×[A-Za-z0-9] + 'T3BlbkFJ' + 20×[A-Za-z0-9]` | no | yes |
| `openai-proj` | `'sk-proj-' + 74×[A-Za-z0-9_-] + 'T3BlbkFJ' + 74×[A-Za-z0-9_-]` | no | no (77.3% — `sk-proj-[A-Za-z0-9_]{16,}` breaks on an early `-`) |
| `github-pat` | `'ghp_' + 36×[A-Za-z0-9]` | no | yes |
| `github-oauth` | `'gho_' + 36×[A-Za-z0-9]` | no | yes |
| `github-fine-grained` | `'github_pat_' + 82×[A-Za-z0-9_-]` | no | no |
| `gitlab-pat` | `'glpat-' + 20×[A-Za-z0-9_-]` | no | no |
| `gitlab-oauth-secret` | `'gloas-' + 64×[A-Za-z0-9_-]` | no | no |
| `slack-bot-token` | `'xoxb-' + 12×digit + '-' + 12×digit + '-' + 24×[A-Za-z0-9]` | no | yes |
| `aws-access-key-id` | `'AKIA' + 16×[A-Z2-7]` | no | yes |
| `google-api-key` | `'AIza' + 35×[A-Za-z0-9_-]` | no | yes |
| `google-oauth-ya29` | `'ya29.' + 60×[A-Za-z0-9_-]` | no | yes |
| `google-client-secret` | `'GOCSPX-' + 28×[A-Za-z0-9_-]` | no | yes |
| `google-refresh-token` | `'1//0' + 60×[A-Za-z0-9_-]` | no | yes |
| `stripe-secret` | `'sk_live_' + 24×[A-Za-z0-9]` | no | yes |
| `sendgrid` | `'SG.' + 66×[A-Za-z0-9_-]` | no | no |
| `twilio-key-sid` | `'SK' + 32×hex` | no | no |
| `mailgun-private` | `'key-' + 32×hex` | no | no |
| `npm-token` | `'npm_' + 36×[A-Za-z0-9]` | no | no |
| `pypi-token` | `'pypi-AgEIcHlwaS5vcmc' + 60×[A-Za-z0-9_-]` | no | no |
| `vault-service` | `'hvs.' + 90×[A-Za-z0-9_-]` | no | no |
| `atlassian` | `'ATATT3' + 186×[A-Za-z0-9_=-]` | no | no |
| `databricks` | `'dapi' + 32×hex` | no | no |
| `doppler` | `'dp.pt.' + 43×[A-Za-z0-9]` | no | no |
| `linear` | `'lin_api_' + 40×[A-Za-z0-9]` | no | no |
| `postman` | `'PMAK-' + 24×hex + '-' + 34×hex` | no | no |
| `shopify` | `'shpat_' + 32×hex` | no | no |
| `square` | `'EAAA' + 56×[A-Za-z0-9_-]` | no | no |
| `telegram-bot` | `10×digit + ':A' + 34×[A-Za-z0-9_-]` | no | no |
| `jwt` | `'eyJ' + 20×c + '.eyJ' + 30×c + '.' + 40×c`, `c = [A-Za-z0-9_-]` | no | yes |
| `private-key-block` | `'-----BEGIN RSA PRIVATE KEY-----\n' + 60×[A-Za-z0-9] + '\n-----END RSA PRIVATE KEY-----'` | no | yes |
| **`aws-secret-access-key`** | **40 uniform draws from the 64-char standard-base64 alphabet — `+` and `/` INCLUDED, slash positions RANDOM. No prefix; gitleaks has no rule for this class either** | **yes** | no |
| **`aws-secret-access-key-64`** | **as above, 64 characters** | **yes** | no |
| **`authress-client-key`** | **`'sc_' + 12×[a-z0-9] + '.' + 5×[a-z0-9] + '.acc_' + 16×[a-z0-9-] + '.' + 30×[a-z0-9+/_=-]`. gitleaks `authress-service-client-access-key`, `config/gitleaks.toml:194–203`; tail at its published minimum of 30** | **yes** | no |
| **`grafana-cloud-token`** | **`'glc_' + 32×[A-Za-z0-9+/]`. gitleaks `grafana-cloud-api-token`, `config/gitleaks.toml:2304–2308`; body at its published minimum of 32** | **yes** | no |
| **`kraken-access-token`** | **`88×[a-z0-9/=_+-]`. gitleaks `kraken-access-token`, `config/gitleaks.toml:2438`. The fixture's 41-character alphabet is slash-dense at 1 in 41; the real rule is case-insensitive (`(?i)` at the head of its pattern, verified 2026-07-26), so a real token draws from 67 characters at 1 in 67 and fragments less. Measured, the same fixture built from the case-insensitive alphabet is caught **93.0%** where this one is caught 73.7% — so C3-3's rate and floor for this row are CONSERVATIVE, understating real coverage by ~19 points. Kept slash-dense on purpose: the floor should be the worst case** | **yes** | no |
| **`jwt-standard-base64`** | **`'eyJ' + 20×b + '.eyJ' + 30×b + '.' + 40×b`, `b = [A-Za-z0-9+/]`. The standard-base64 JWT variant gitleaks covers at `config/gitleaks.toml:2426`; Wienerdog's labelled `jwt` rule is base64url-only and misses it.** *Citation caveat (round 3): gitleaks' `jwt` payload class there is `[a-zA-Z0-9\/\\_-]`, which covers `/` and `\` but **not** `+`, so it is a looser warrant for this fixture's alphabet than the row implies. The conclusion is unaffected and was measured, not inferred — Wienerdog's `jwt` rule is base64url-only and misses this fixture regardless* | **yes** | no |
| `slack-webhook-url` | `'https://hooks.slack.com/services/T' + 8×[A-Z0-9] + '/B' + 8×[A-Z0-9] + '/' + 24×[A-Za-z0-9]`. gitleaks `slack-webhook-url`, `config/gitleaks.toml:3032`. A slash-bearing format that does **not** regress — its final path component is a 24-char slash-free run, so tier 1 catches it. **The conclusion rests on Slack's real URL format, not on this fixture's shape:** gitleaks' pattern is a uniform `[A-Za-z0-9+/]{43,56}` run after `/services/`, which would fragment; the fixture is hard-coded to the structured `T…/B…/…` form Slack actually issues, whose last component is always ≥ 24 characters. Present as closure, not as a regression | yes | no |
| **`authorization-basic`** | **`'Authorization: Basic ' + 40×[A-Za-z0-9+/]`** — the fixture carries its own header, as `private-key-block` does, because the header is what the credential *is*. gitleaks covers this as the `Basic` arm of `curl-auth-header`, `config/gitleaks.toml:361`. **The one C1 row added by A16**; without that rule it is caught 85.4% and `quarantine` 0% in `bare`/`prose`/`table` (M4d). Its `labelled? = yes` is satisfied by `basic-auth` in `bare`/`prose`/`table` and by the shipped legacy assignment rule (`generic-secret`) in `assign`, where `secret=Authorization…` is consumed before A16 sees it — see AC-21 | **yes** | **yes** |

The **bold** rows are the corpus requirement this spec exists to enforce: a
credential format whose entropy-visible tail is drawn from an alphabet
containing `/`. A hand-written slash-bearing sample would pass every assertion
below while the rule leaked double digits of real keys. **The regression surface
is the bold rows that are also `labelled? = no`, less `slack-webhook-url`;
C3-3 is derived from exactly that intersection.** `authorization-basic` is bold
(its body is standard base64) but does not regress, because A16 gives it a
labelled rule — which is precisely the point of A16.

Contexts, exactly four: `bare` → `` `blob <t> end` ``; `assign` →
`` `secret=<t>` ``; `prose` → `` `the key is <t> ok` ``; `table` →
`` `| token | <t> | ok |` ``.

PRNG — copy verbatim, seed `0xC0FFEE`, one fresh instance per cell:

```js
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
}
```

#### C2 — the prose corpus: false positives, plus the separator controls

**44 rows in seven groups.** Rows **1–28** are the false-positive corpus proper —
sanitized reproductions of the classes measured in M1/M2/M4a, none of which may
reach `quarantine`. Rows **29–31** are **positive** controls for the separator
tokens A8a adopts; they *must* reach `quarantine`, and that is what they test.
Row **32** is a measured accepted `quarantine` residual. Rows **33–34** are
**negative** controls for the two gitleaks members A8a excludes; they must stay
below `quarantine`. Rows **35–41 and 44** are **negative** controls for the
clauses of **A8** that the vault cannot hold at any setting (M4e), one clause per
row: the filler **bound** (row 35; row 37 holds the same bound *and* the lookback
derivation), the filler **character class** (row 36), the **same-line**
restriction (row 38), the requirement that the candidate **follow the
separator directly**, with no filler between them (row 39), the **separator
cardinality** — exactly one token, not a run of them (row 40) — the
**POST-separator quote/backtick cardinality** (row 41) and the **PRE-separator**
one (row 44). They must all stay below `quarantine` too. Rows **42–43** are the
seventh group and the odd one out: **measured, accepted, destructive residuals**
that the corpus reproduces precisely because nothing else in it does — a
sensitive keyword carrying a word-character metadata suffix (`_path`, `_id`)
still binds under A8 as written, so a path-shaped run and a compact 32-hex UUID
still quarantine. They are `quarantine` by design and are documented in "Accepted
residuals" item 6; **neither is a regression**, because the shipped detector
quarantines both today. **M4e is the register of which row holds
which clause, and V-29 makes every EDIT to that register mechanical** by
digesting A8's row and M4e's table whole: adding a clause to A8 without adding a
row here fails the build. What it does not do is audit the pairing that already
exists — that is a human reading, done once per round, and the defect it keeps
finding (round 3 twice, round 4 twice, round 5 twice, round 6 once, and round 1
of the design gate once more — the optional-whitespace clause) is a clause
already written with no row. See "Completeness registers and what actually bounds
each".

The maintainer's vault is private; **no verbatim sentence from it appears here or
may be added.** Expected disposition under the proposed detector is
`clean` unless stated. **Every `Expect` cell below was executed against a
from-spec prototype, not reasoned about** — round 2 found two
cells (20 and 24) that prose elsewhere in this spec had already contradicted.
Rows 1–41 were executed on 2026-07-26; **rows 42, 43 and 44 were executed on
2026-07-27 against a prototype that was first validated by reproducing all
forty-one existing `Expect` cells**, which is what makes the three new
dispositions measurements rather than predictions.

| # | Row | Expect |
|---|-----|--------|
| 1 | `see [[01-Projects/wienerdog/current-state]] for detail` | clean |
| 2 | `the note lives at 02-Areas/second-brain/tooling-notes now` | clean |
| 3 | `path /Users/example/Documents/Claude_Projects/thing here` | clean |
| 4 | `binary /opt/homebrew/bin/example-cli --profile default` | clean |
| 5 | `agent /Library/LaunchAgents/com.example.job.plist loaded` | clean |
| 6 | `script koltsegvetes/analysis/scripts/fetch_sheet ran` | clean |
| 7 | `config deployment/daemon/trading_daemon_configuration` | clean |
| 8 | `release github.com/example/project/releases/tag/v0.9.1` | clean |
| 9 | `docs docs/marketing/articles/hackernews-launch.md edited` | clean |
| 10 | `ID-token signature verification (aud/iss/exp/verified/exact-domain) ok` | clean — the M4 proximity FP |
| 11 | `the refresh_token path self-heals (damaged/missing/broken/ok)` | clean — the M4 proximity FP |
| 12 | `the wienerdog Google-token (drive.readonly) is primary — koltsegvetes/analysis/scripts/x` | clean — the M4 proximity FP |
| 13 | `a credential bug: PATH omits ~/.local/bin, not /opt/homebrew/bin/claude` | clean — the M4 proximity FP |
| 14 | `Train 5 independent GradientBoostingClassifier models per horizon` | **redact** — accepted residual |
| 15 | `call generateCodeVerifierAsync before the redirect` | **redact** — accepted residual |
| 16 | `session 019f819d-6aea-7950-b28e-9f26b7718c08 resumed` | clean |
| 17 | `json {"uuid":"b593bdb9-a85e-431b-b9fe-8f564994c09b","tokens":20685}` | clean |
| 18 | `daily note 05-Daily/2026/07/2026-07-24-morning-review saved` | clean |
| 19 | `env order is WIENERDOG_HOME+HOME+CLAUDE_CONFIG_DIR+CODEX_HOME` | clean |
| 20 | `see Documentation=RepositoryConfiguration end` | **redact** — accepted residual. One 37-char tier-1 run at 3.925 bits; no slash anywhere, so tiering cannot reach it |
| 21 | `the constant ABCDEFGHABCDEFGHABCDEFGHABCDEFGH appears in prose` | clean — 3.000 bits, below the floor |
| 22 | `padding deadbeefdeadbeefdeadbeefdeadbeefdeadbeef end` | clean — 2.156 bits, below the floor |
| 23 | `[REDACTED:aws_secret_access_key] [REDACTED:high-entropy]` | clean — re-entrancy |
| 24 | `source https://www.example.gov/releases/consumerpriceinflationukjuly2025` | **redact** — accepted residual. The 44-char tier-2 run `gov/releases/consumerpriceinflationukjuly2025` has no bound context, and its tier-1 sub-run `consumerpriceinflationukjuly2025` is 32 chars at 4.179 bits |
| 25 | `run id 7KpQm2XvR9tWcZbN4dYfGh3L logged` | **redact** — accepted residual. The **opaque-token** sub-class: a 24-char random-looking id in prose, no keyword, no separator. Two of the four runs measured on the real vault are this shape, not prose identifiers, and until round 2 the corpus had no reproduction of it |
| 26 | `\| secret \| Projects/example/wienerdog/current-state \|` | clean — the M4a table false positive. **Quarantines if the vertical bar is in `SEP`** (Table A row A8a); this row is the regression test for that |
| 27 | `` \| `shasum -a 256 src/core/secret-scan.js` \| `be54813a2602a78822e939663ab31c3eff164261` \| `` | **redact** — accepted residual. **Quarantines (destructively) if the vertical bar is in `SEP`**: the keyword is the `secret` inside `secret-scan.js`, the filler is `-scan.js`, the separator is the cell wall, the candidate is a git hash. This is the exact line M4a measured in this repository's own `docs/` tree |
| 28 | `\| modify \| src/core/secret-scan.js \| one canonical alphabet declaration \|` | clean — a Deliverables-table row of the shape every spec in this repo contains. **Stays clean even with the vertical bar in `SEP`**: its longest tier-2 run is `src/core/secret`, 15 characters, under the 24 floor, so no `SEP` can make it fire. It is the control that separates "the bar binds context" from "the bar reddens everything" |
| 29 | `apiKey := "q7PmXz4KvR9tWc2LbN8dYfGhJ3xA5uEw"` | **quarantine** — positive control for A8a's `:{1,3}=`. Go short variable declaration |
| 30 | `'secret_key' => 'Kf3nQ8xW2mZr7Ld5Vp1Ty9Bc4Hs6Jg0A'` | **quarantine** — positive control for A8a's `=>`. PHP array / Ruby hash entry. Note the keyword is the `secret` inside `secret_key` and the filler is `_key` |
| 31 | `API_TOKEN ?= Zx4Qm8LpR2vT7yNb5Wc1KdJ9Hs3Ag6Ue` | **quarantine** — positive control for A8a's `?=`. Make conditional assignment |
| 32 | `` const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=' `` | **quarantine** — accepted residual, and the only C2 row outside 29–31 that withholds. Prose describing an alphabet: keyword `token` inside `TOKEN_CHARS`, filler `_CHARS` plus a space, separator `=`, then a 65-character run at ~6.0 bits. Measured once over the `docs/` tree and **zero** times in the vault (M4a); **not a regression** — the shipped detector quarantines it too. See "Accepted residuals" item 5 for why it is not suppressed |
| 33 | `the session token, q7PmXz4KvR9tWc2LbN8dYfGh, expires on Friday` | **redact** — negative control for A8a's exclusion of `,`. Quarantines if `,` joins `SEP` |
| 34 | `\| secret \|\| be54813a2602a78822e939663ab31c3eff164261 \|` | **redact** — negative control for A8a's exclusion of `\|\|`. A compact markdown table with an empty cell. Quarantines if `\|\|` joins `SEP` |
| 35 | `the token rotation runbook lives here: Rt6Yh2Nk9Pw4Jm7Vx3Bq5Zd8` | **redact** — negative control for A8's filler **bound**. Keyword `token`, then **28** filler characters (all inside `[ \t\w.-]`), then the separator `:`, then a 24-character opaque id at 4.585 bits. 28 > 20, so nothing binds and the id falls to tier 1. **Quarantines if `ENTROPY_CTX_FILLER_MAX` rises to 40** (C3-12, mutation M-5). It does **not** move when the filler *class* widens — that is row 36's job |
| 36 | `` credential ("legacy"): `Projects/example/wienerdog/current-state` `` | **clean** — negative control for A8's filler **class**. Keyword `credential`, then **11** filler characters — a space followed by `("legacy")`, three of which (`(`, `"`, `)`) are outside gitleaks' `[ \t\w.-]` — then the separator `:` and a backtick, then a path-shaped 34-character tier-2 run at 4.021 bits whose longest tier-1 sub-run is under the 24 floor. Under A8 the keyword cannot reach the separator, so the row is clean. **Quarantines if the filler class widens to `[^\n]`** (C3-13, mutation M-13). It does **not** move when the filler *bound* rises — that is row 35's job. The shape is the sanitized reproduction of the one real vault note M4b measures, and the candidate is row 26's, so the two rows differ only in binding mechanism |
| 37 | `the authorization runbook and its rotation checklist here: Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6` | **redact** — negative control for A8's filler **bound** *and* for `hasBoundContext`'s **lookback derivation**, which row 35 cannot hold. Keyword `authorization` (13 characters — the one A7 keyword that is not in `SENSITIVE_KEYS`, so no labelled rule consumes this row), then **40** filler characters — the words `runbook and its rotation checklist here` together with the space that precedes them, every one of the 40 inside `[ \t\w.-]`, then the separator `:` and one space, then a 24-character opaque id at 4.585 bits. 40 > 20, so nothing binds and the id falls to tier 1. Its **binding span is Table L's** — deliberately more than `21 + ENTROPY_CTX_FILLER_MAX + 12` evaluates to at the shipped bound. (That arithmetic result is **Table L row L3**'s; this cell refers to the expression.) **Under M-5 it rises to `quarantine` only if the lookback is derived** — its span exceeds **Table L row L3**'s value, so a frozen literal truncates the slice and the row stays `redact`. **C3-12 states that asymmetry in full and this cell does not restate it.** It does **not** move when the filler *class* widens |
| 38 | `rotate the authorization token before Friday:` + a newline + `Projects/example/wienerdog/current-state is unaffected` | **clean** — negative control for A8's **same-line** clause. The keyword (`authorization`, filler 20; also `token`, filler 14), the separator `:` and the candidate are all present and correctly ordered, and the **only** thing that must stop them binding is the newline between the separator and the candidate. A8 is same-line only, so nothing binds and the 34-character path-shaped tier-2 run `Projects/example/wienerdog/current` (4.021 bits, longest tier-1 sub-run 9 characters) is left alone. **Quarantines — destructively, on ordinary prose — under any implementation that reaches across the newline**, which is what a `\s*` between the separator and the candidate does (C3-14, mutation M-36). The newline is part of the fixture data, not this table's formatting |
| 39 | `the authorization checklist: see Jd4Vn8Sc2Mq6Bx1Zt5Wf9Hk3 for detail` | **redact** — negative control for A8's **adjacency** clause: the candidate must follow the separator directly, with only optional whitespace and one optional quote or backtick between them. Keyword `authorization`, filler `checklist` plus its leading space (10 characters, well inside the bound), separator `:` — and then the word `see` sits between the separator and the 24-character opaque id at 4.585 bits. Under A8 nothing binds and the id falls to tier 1. **Quarantines under any implementation that also allows filler *after* the separator** (C3-15, mutation M-37) — the symmetric mistake to row 35's, and the clause M-5's own note leans on when it explains why raising the bound moves no row 1–28 |
| 40 | `the authorization digest of the file == Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6` | **redact** — negative control for A8's separator **cardinality**: exactly one token from `SEP`, never a run of them. Keyword `authorization`, then **exactly 20** filler characters — the words `digest of the file` together with the space that precedes them and the one that follows, every one of the 20 inside `[ \t\w.-]` — then **two** separator tokens `==`, then one space, then row 37's 24-character opaque id at 4.585 bits. Under A8 a single token leaves the second `=` stranded between the separator and the candidate, nothing binds, and the id falls to tier 1. **Quarantines under a binder that quantifies the separator — `(?:${SEP})+`** (C3-16, mutation M-38), which is the form M4f measures as a real false positive on this repository's own `docs/` tree. **The filler is exactly 20 characters on purpose**: that is what keeps the row unreachable under M-13 (a `[^\n]` filler would need a 21st character to cross the first `=`) and under M-5 (`=` is in no filler class at any bound), so this row moves under M-38 and under nothing else. M4f explains why it is a shortened reproduction rather than the measured `docs/` line |
| 41 | `` the authorization value: `"Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6"` documented `` | **redact** — negative control for A8's quote/backtick **cardinality**: at most one, never a run. Keyword `authorization`, filler `value` plus its leading space (6 characters), separator `:`, one space, then **two** quote characters — a backtick and a double quote, the ordinary way this repository's documentation shows a JSON string value — then row 37's 24-character opaque id at 4.585 bits. Under A8 only one of the two may be consumed, nothing binds, and the id falls to tier 1. **Quarantines when that quantifier is `*` instead of `?`** (C3-17, mutation M-39). Unlike row 40 the loosened form costs **zero** measured lines on `docs/` (M4f); the row exists because the clause is written and was unheld, which is the same reason rows 38 and 39 exist. **This row holds the POST-separator slot only** — both its quote characters sit after the separator; the pre-separator slot is row 44's |
| 42 | `credential_path: Projects/example/wienerdog/current-state` | **quarantine** — an **accepted, measured, destructive residual**, added in round 1 of the design gate. Keyword `credential` (from the shipped `credentials?` alternation), filler `_path` — five characters, every one inside `[ \t\w.-]` because `_` is a word character — then the separator `:`, one space, then a **path-shaped** 34-character tier-2 run at 4.021 bits whose longest slash-free segment is **9** characters. A8 as written binds it and quarantines it. **Its candidate is byte-identical to row 36's and row 26's**, which is the point of the triple: row 36 stays `clean` because its filler carries `(`, `"` and `)`; row 26 stays `clean` because the bar is not in `SEP`; this row quarantines because a metadata suffix made of word characters reaches the separator. **NOT a regression** — the shipped context-free detector quarantines the same run today (34 chars, 4.021 bits, both over the shipped floors). See "Accepted residuals" item 6, which records why a keyword narrowing was measured and rejected |
| 43 | `token_id: 019f819d6aea7950b28e9f26b7718c08` | **quarantine** — the second **accepted, measured, destructive residual** of the same class, on a different candidate shape. Keyword `token`, filler `_id`, separator `:`, one space, then a **compact 32-hex UUID** at 3.679 bits. **Its candidate is row 16's UUID with the hyphens removed**, which is the whole content of the pairing: row 16 is `clean` because `-` is in neither alphabet and shreds that value into four sub-24 fragments, while the compact spelling is one unbroken 32-character run over the floor. Both spellings occur in real systems. **NOT a regression** — the shipped detector quarantines this run today too. Residual 6 |
| 44 | `` the authorization quoted JSON sample `": Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6 `` | **redact** — negative control for A8's **PRE-separator** quote/backtick cardinality, which no row held until round 1 of the design gate. Keyword `authorization`, then **exactly 20** filler characters — the words `quoted JSON sample` together with the space that precedes them and the one that follows, every one of the 20 inside `[ \t\w.-]` — then **two** quote characters, a backtick followed by a double quote, then the separator `:`, one space, then row 37's 24-character opaque id at 4.585 bits. Under A8 only one of the two pre-separator quotes may be consumed, the other is in no filler class, nothing binds, and the id falls to tier 1. **Quarantines when the PRE-separator quantifier ALONE becomes `*`** (C3-19, mutation **M-44**), and also under **M-39**, which quantifies both slots together. **The filler is exactly 20 characters for row 40's reason**: at the bound, M-13's widened `[^\n]` class would need a 21st character to cross the first quote, and M-5's raised bound cannot help because neither quote character is in `[ \t\w.-]` at any bound. Measured over all forty-four rows: this row moves under M-39 and M-44 and under nothing else |

Rows 20, 21, 22, 24, 27 fire **today**; 21 and 22 go clean under this WP and 20,
24 and 27 are softened from `quarantine` to `redact`. Rows 10–13 fire under a
proximity-based tier 2 and are why the binding is separator-based. Rows 26 and 27
fire under a `SEP` containing a vertical bar and are why it does not (M4a);
row 28 is the control that stays clean either way. Rows 29–31 fall from
`quarantine` to `redact` under a one-character `SEP` (M4c); rows 33 and 34 rise
to `quarantine` if `,` or `\|\|` joins it. Rows 40 and 41 fire **today** as well
and are softened to `redact` here, like rows 20/24/27. Rows 35–41 and 44 each
rise to `quarantine`
under exactly one loosening of A8 and under no other: the filler bound (35 and
37), the filler class (36), the same-line restriction (38), the
separator-to-candidate adjacency (39), the separator cardinality (40), the
post-separator quote cardinality (41) and the pre-separator one (44). **The
one-row-per-clause discipline is
the point** — a row that moves under two mutations holds neither cleanly, and
that independence is measured, not arranged (M4e). Row 37 is the pair to row 35
rather than a duplicate of it: both hold the bound, and only 37 also
discriminates a derived lookback from a hard-coded one.

**Row 44 has one deliberate exception to that discipline and it is not a
weakening.** It moves under **two** mutations — M-44, which quantifies the
pre-separator slot alone, and M-39, which quantifies *both* slots — because
A8 states one clause governing two slots and M-39 is the mutation of that whole
clause. Row 41 is the mirror image: it moves under M-39 and not under M-44. So
the pair 41/44 discriminates the two slots from each other, which is exactly what
neither row alone could do and what round 5 recorded as the open gap.

**Rows 42 and 43 are `quarantine` and are not controls at all** — they are
measured residuals, and they hold nothing that a mutation is expected to move.
They do participate in C3-5's equality, so a detector that stops binding them
fails; measured, they move under **M-1** (row 42 only — the wide alphabet is
what holds its path-shaped run together) and under the whitespace mutation M4e's
eleventh row names, and under nothing else in the mutation table.

**Escaping note for the fixture file.** Rows 26, 27, 28 and 34 are markdown table
rows *about* markdown table rows, so their vertical bars are written `\|` above.
The fixture file must contain the **unescaped** single-character `|` (two of them,
adjacent and unseparated, in row 34); the backslashes are this table's markdown,
not part of the data. Row 36's value is wrapped in **backticks in the data
itself** — the backtick before `Projects` is the optional quote/backtick A8
allows between the separator and the candidate, and it must be present in the
fixture; the outer `` `` … `` `` in the cell above is this table's markdown and
is not. **Row 41 carries the same distinction and the row is about it**: its data
contains a backtick immediately followed by a double quote — both of them real
bytes of the fixture, and the two quote characters the row exists to count — and
a closing backtick after the id; the outer `` `` … `` `` around the whole cell
is again this table's markdown. Write row 41 with one quote character too few
and it silently becomes a duplicate of an ordinary bound row.

**Row 44 is the same hazard on the other side of the separator, and it is the
easier one to write wrong.** Its data is exactly:

```text
the authorization quoted JSON sample `": Kb7Wm3Qx9Ld5Tz2Ph8Nr4Vg6
```

— a backtick immediately followed by a double quote, **both before the colon**,
both real bytes of the fixture, and **no closing quote of any kind**. The outer
`` `` … `` `` in the cell above is this table's markdown and is not data. There
are exactly 20 characters between the `n` of `authorization` and the backtick,
counting the space on each end; write 19 or 21 and the row stops being
unreachable under M-13 and M-5, which is the property that makes it hold one
clause instead of three. Write one quote character instead of two and the row
becomes an ordinary binding row that quarantines under A8 — a silent inversion of
its `Expect` cell.

**Row 38 contains a real newline.** Its cell above is written as two quoted
fragments joined by the words "+ a newline +", because a markdown table cell
cannot hold a line break. The fixture value is the single string
`'rotate the authorization token before Friday:\nProjects/example/wienerdog/current-state is unaffected'`
— one `\n`, no trailing newline, and no other whitespace change. It is the only
multi-line row in C2, and the newline is the entire point of the row: write it
wrong and the row silently becomes a duplicate of row 39's shape.

#### C3 — the acceptance numbers

**Every count in this WP is decided here.** No other paragraph, criterion,
verification step, mutation row or residual may restate a number from this
table; they cite a row id. Round 2 found four separate findings that were all
the same defect — a number restated in prose and drifted from the table — so
this is a contract, not a style preference (ADR-0031).

| # | Assertion | Value |
|---|-----------|-------|
| C3-1 | tier membership over all 95 printable-ASCII characters (codes 32–126) | **Absolute, not relative.** Tier 1 accepts **exactly** the 64 characters `` `+0123456789=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz` ``; tier 2 accepts **exactly** those plus `/`, 65 characters. Both literals are **hand-written independently in the test file**, not derived from `src/`. The derived facts — the two sets differ in exactly one character, and that character is `/` — are asserted *in addition*, never instead. **Observation mechanism: behavioural, through `scanAndRedact` only** (A14 keeps the export list closed, so neither regex is reachable): for character `c`, build `run = 'ABCDEFGHIJKL' + c + 'MNOPQRSTUVWX'` — 25 characters, ≥ 4.5 bits either way. Tier 2 accepts `c` **iff** `scanAndRedact('authorization: ' + run)` reports `high-entropy` at `quarantine`; tier 1 accepts `c` **iff** `scanAndRedact('blob ' + run + ' end')` reports `high-entropy` at `redact`. If `c` is not in the alphabet the run splits into two 12-character halves, both under the 24 floor, and there is no finding at all. `authorization` is the carrier because it is the one A7 keyword that is **not** in `SENSITIVE_KEYS`, so no labelled rule consumes the probe |
| C3-0 | corpus sizes | C1 has **39** fixture ids (count the rows of C1 — each row is exactly one id); C2 has **44** rows; contexts are **4**. The FN matrix is therefore **39 × 4 = 156** cells. The test asserts these three literals against the fixture module's own length, so a fixture added without updating this row fails. *C2 went 41 → 44 in round 1 of the design gate: rows 42 and 43 reproduce the metadata-suffix binder residual and row 44 holds A8's pre-separator quote slot. C1 and the cell count are unchanged* |
| C3-2 | FN matrix, C1 × 4 contexts, N = 2 000 draws per cell, seed `0xC0FFEE`, one fresh RNG per cell | **138 of the 156 cells: proposed catch rate ≥ today's, cell by cell.** The remaining **18** are exactly the cells enumerated in C3-3 — asserted as an **equality on the (fixture, context) set**, not as a count, so a change that regresses a different cell fails even if the total stays 18 |
| C3-3 | the permitted regressions — the complete set, 6 fixtures × 3 contexts | every fixture marked **`/`? = yes** in C1 *except* `slack-webhook-url` and `authorization-basic`, in `bare`, `prose` and `table` context only. **Never `assign`.** Measured 2026-07-26 at **N = 2 000** (the suite's own draw count, which is what these floors are set against; M4a states three of the same quantities at N = 20 000 and they agree to a tenth of a point) and the floor for each: `aws-secret-access-key` 100 → 85.4 (floor **≥ 80%**); `aws-secret-access-key-64` 100 → 98.3 (**≥ 95%**); `authress-client-key` 38.1 → 22.1 (**≥ 18%**); `grafana-cloud-token` 100 → 77.1 (**≥ 72%**); `kraken-access-token` 91.3 → 73.7 (**≥ 68%**, and conservative — see C1's note on that row); `jwt-standard-base64` 100 → 96.5 (**≥ 92%**). Floors sit ~5 points below measurement so PRNG drift is not a false alarm while a real regression is |
| C3-4 | labelled-rule coverage | exactly the **14** C1 fixtures marked **labelled? = yes**: `anthropic-api-key`, `openai-legacy`, `github-pat`, `github-oauth`, `slack-bot-token`, `aws-access-key-id`, `google-api-key`, `google-oauth-ya29`, `google-client-secret`, `google-refresh-token`, `stripe-secret`, `jwt`, `private-key-block`, `authorization-basic`. Each is caught **100%** at **`quarantine`** severity in all four contexts. Asserted as an **equality on the id set** — a 15th fixture becoming labelled-covered must be a deliberate table edit. (`authorization-basic` is on this list *because of* A16; delete that rule and this row fails, which is mutation M-35) |
| C3-5 | C2 corpus, `quarantine` severity | **exactly the id set {29, 30, 31, 32, 42, 43}** — an **equality**, not a ceiling, for the same reason C3-6 is one. Rows 29–31 are the separator positive controls and *must* withhold; row 32 is the accepted alphabet-prose residual; **rows 42 and 43 are the accepted metadata-suffix binder residuals added in round 1 of the design gate** (residual 6), and they are in this set because they really do quarantine and the corpus must say so rather than omit the class. **This equality is what holds TWO of A8's clauses in the main suite, needing no 35–44 negative control for either.** (a) **Case-insensitivity**: measured 2026-07-26, a case-sensitive binder drops rows 29, 31 and 32 to `redact` — their keywords are the `Key` of `apiKey` and the `TOKEN` of `API_TOKEN` and `TOKEN_CHARS` — while row 30's already-lower-case `secret` and rows 42/43's already-lower-case keywords stay put, so the set shrinks to `{30, 42, 43}` and this row fails (mutation **M-42**). (b) **The optional whitespace on each side of the separator**: measured 2026-07-27, removing both allowances drops **all six** members out of `quarantine` and the set becomes empty. **No row in 1–28 may withhold an artifact** — that is the destructive-outcome promise, it is unchanged, and rows 42/43 sit deliberately outside that range so that adding a measured residual can never be mistaken for relaxing it |
| C3-6 | C2 corpus, `redact` severity | **exactly the id set {14, 15, 20, 24, 25, 27, 33, 34, 35, 37, 39, 40, 41, 44}** — an **equality**, not an upper bound. Row **44** joined it in round 1 of the design gate; it is the pre-separator quote control and becomes `quarantine` under M-44 and under M-39. A detector that fires on nothing satisfies "at most N" and must fail here. Rows 33 and 34 are the negative separator controls: they are `redact`, and they become `quarantine` under M-41 / M-43. Rows 35 and 37 are the filler-**bound** controls and become `quarantine` under M-5. Row 39 is the **adjacency** control and becomes `quarantine` under M-37; row 40 is the separator-**cardinality** control and becomes `quarantine` under M-38; row 41 is the quote-**cardinality** control and becomes `quarantine` under M-39. Rows 36 and 38 are the filler-**class** and **same-line** controls: both are `clean`, so both are in neither this set nor C3-5 — row 36 enters C3-5 under M-13 and row 38 under M-36, which is what breaks that equality in each case. **This row is the only place the set is written**; every other surface, this table's own commentary included, cites `C3-6` |
| C3-7 | today's baseline column | the `today` numbers in C3-2/C3-3 are **constants transcribed from this table into the test file**, not regenerated. See "Why no dependency on the oracle WP" |
| C3-8 | `SEVERITY.REDACT` producers in `src/core/secret-scan.js` | exactly **one** `add(…)` call site (A13), counted as **occurrences**, not lines |
| C3-9 | severity escalation on a mixed note (A15) | a two-line input containing one bound tier-2 candidate and one bare tier-1 candidate yields **one** `high-entropy` finding at **`quarantine`** with `count` 2, **in both line orders**, and `hasHardFinding` is `true` for both. Asserted for both orders explicitly — a single-order test passes against the unescalated code |
| C3-10 | C2 rows 26, 27, 28 under a `SEP` containing the vertical bar | rows **26 and 27** reach `quarantine`; row **28 stays clean**, because its longest tier-2 run (`src/core/secret`) is 15 characters and no `SEP` can lift it over the 24 floor. Asserted as that exact three-way outcome, not as "at least one of them fires" — the weaker form is satisfied by a mutation that reddens only row 26. Held by mutation row M-14, not by the main suite; it is what makes the A8a bar decision testable rather than documentary |
| C3-11 | the separator tokens A8a **adopts**, under a one-character `SEP` | C2 rows **29, 30 and 31 fall from `quarantine` to `redact`** — the exact cliff M4c measures. Held by mutation row M-40; it is what makes the A8a *adoption* decisions testable rather than documentary, in the same way C3-10 holds the exclusions |
| C3-12 | A8's filler **bound**, under `ENTROPY_CTX_FILLER_MAX = 40`, **and `hasBoundContext`'s lookback derivation** | C2 rows **35 AND 37 both rise from `redact` to `quarantine`**, and **no other row in the 35–41/44 group moves** (36 and 38 stay `clean`; 39, 40 and 41 stay `redact`). Asserted as that exact seven-row outcome, not as "some row moves" — the paired non-movement is what keeps each clause of A8 independently held. **Row 37 is what makes this row also a lookback assertion**: its binding span exceeds what the expression evaluates to at the shipped bound, so a lookback frozen there leaves it at `redact` under this mutation while row 35 still moves. **Both spans are Table L's** and this row restates neither. **Row 35 moving alone is a FAILURE of this row, not a pass** — it means the lookback is a literal, which is the defect V-2e's grep was found unable to see in round 3. Held by mutation row **M-5**. Before round 3 no corpus row separated 20 from 40 at all and M-5 was unachievable; the vault cannot separate them either, at any setting (M4e) |
| C3-13 | A8's filler **class**, under `[^\n]` in place of `[ \t\w.-]` | C2 row **36 rises from `clean` to `quarantine`**, and **no other row in the 35–41/44 group moves** (35, 37, 39, 40 and 41 stay `redact`; 38 stays `clean`). Asserted as that exact seven-row outcome, for the same reason as C3-12. Held by mutation row **M-13**. Before round 3 no corpus row separated the two classes and M-13 carried a written licence to stay green; that licence is withdrawn |
| C3-14 | A8's **same-line** restriction, under a binder that reaches across a newline (the `\s*` form) | C2 row **38 rises from `clean` to `quarantine`**, and **no other row in the 35–41/44 group moves**. Held by mutation row **M-36**. This is the destructive direction — a newline-crossing binder turns two adjacent lines of ordinary prose into a withheld note — and until round 3 nothing in this document held it: A8 said "same line only", `hasBoundContext`'s JSDoc repeated it, and no row, no mutation and no grep could tell a conforming implementation from a crossing one. **Measured on this repository's `docs/` tree, the false-positive cost of the crossing form is zero lines**, so the clause is not being defended on measured FP; it is being defended because it is a written contract clause with no holder |
| C3-15 | A8's **adjacency** requirement — the candidate follows the separator directly, with only optional whitespace and at most one quote or backtick between them — under an implementation that also permits filler there | C2 row **39 rises from `redact` to `quarantine`**, and **no other row in the 35–41/44 group moves**. Held by mutation row **M-37**. Same provenance as C3-14: A8 states it, M-5's own note leans on it to explain why raising the bound moves no row in 1–28, and before round 3 nothing held it. **Measured on `docs/`, the false-positive cost of the loosened form is likewise zero lines** — again the defect is an unheld clause, not a measured regression |
| C3-16 | A8's separator **cardinality** — exactly one token from `SEP`, never a run — under a binder that writes `(?:${SEP})+` at the use site | C2 row **40 rises from `redact` to `quarantine`**, and **no other row in the 35–41/44 group moves**. Held by mutation row **M-38**. **This is the one clause of the seven whose loosening has a measured false-positive cost** (M4f): `(?:${SEP})+` quarantines `docs/specs/done/WP-secret-scan-baseline-oracle.md:612`, an ordinary `==` comparison in a merged spec, and `==` generalises to every equality in documentation or code. Until round 4 nothing held it — the loosened module leaves the `SEP` declaration byte-identical, so V-12's two pins, V-2e's line pin and V-2's alphabet pins all stay green (measured), and it moved none of the 39 corpus rows, so the M-protocol could not discriminate it either |
| C3-17 | A8's quote/backtick **cardinality** — at most one on each side of the separator, `?` and never `*` — **under the mutation that quantifies BOTH slots at once.** This is the whole-clause form; C3-19 is the pre-separator slot in isolation | C2 rows **41 and 44 both rise from `redact` to `quarantine`**, and **no other row in the 35–41/44 group moves** (35, 37, 39, 40 stay `redact`; 36, 38 stay `clean`). Asserted as that exact eight-row outcome. Held by mutation row **M-39**. Same provenance as C3-14 and C3-15, and the same standing: **measured on `docs/`, the loosened form adds zero lines** (M4f), so the clause is held because it is written and was unheld, not because a measurement demands it. Like C3-16 it was invisible to every grep and to all 39 pre-round-4 corpus rows. **Round 5 found this row holding the POST-separator slot only and round 1 of the design gate closed the gap**: row 41's two quote characters both sit *after* the separator, and M-39 moves both slots at once, so 41 alone could not discriminate the pre-separator one. **Row 44 now does** — see C3-19. Re-measured 2026-07-27 over all forty-four rows |
| C3-19 | A8's **PRE-separator** quote/backtick cardinality, in isolation — under an implementation that writes `*` on the pre-separator quote slot **and leaves the post-separator slot at `?`** | C2 row **44 rises from `redact` to `quarantine`**, and **no other row moves at all** — not row 41, and no row of the 35–41 group. Asserted as that exact outcome. Held by mutation row **M-44**. **This row is what makes 41 and 44 a discriminating pair rather than a duplicate**: M-39 moves both, M-44 moves only 44, so an implementation that got one slot right and the other wrong fails here where it passed C3-17. **Measured on `docs/`, the loosened form adds zero lines** (M4f, 2026-07-26), so — like C3-14, C3-15 and C3-17 — this clause is held because it is written, not because a measurement demands it. *Added in round 1 of the design gate; the previous revision named this row id and this mutation as the right follow-on and declined to do it for want of an executed prototype, which this pass built and validated against all forty-one existing `Expect` cells before adding row 44* |
| C3-18 | **every edit to A8 or to the M4e register is forced through a reconciliation pass** | Table A row **A8** and the **M4e** register table are each pinned WHOLE, BY DIGEST, asserted by **V-29**. Any edit to either side — a clause added to A8, a clause extended in place, a register row added, reworded or deleted — moves a digest and fails the build, and the architect reconciles the pair and recomputes both literals in one disclosed pass. **What this row asserts is change-detection, not completeness, and the wording is deliberate**: a digest pins the bytes it is given and has no opinion about whether A8's clauses and M4e's rows agree, so a clause *already* written with no register row stays missing silently. Rounds 3, 4 and 5 each found exactly that, two clauses at a time, while the register asserted completeness in prose; round 4's repair — a `[C]` marker per clause, the two counts asserted equal — was itself hand-written and measured blind in round 5 to an unmarked clause and to two clauses behind one marker. **The mechanism is decided here and nowhere else, and it is a digest rather than a count**: no marker set and no clause vocabulary survives on either surface. The residual human input, and the same residual for every other register in this document, is recorded in **"Completeness registers and what actually bounds each"** |

**Why the C2 dispositions are set there.** No row in 1–28 may withhold, because
withholding is the destructive outcome — it is the entire subject of this WP, it
costs the user a note, and it defers their transcripts. Zero is measured (M5: the
one remaining withhold on the real vault is a labelled `aws-key` rule, not the
entropy pass) and there is no argument for accepting even one *in that group*.

C3-5 is nevertheless an equality on **an id set — read it in C3-5, which is the
only place it is written** — rather than the flat "0 rows" an earlier revision
asserted, for **three** reasons. Rows 29–31 are positive controls: a
corpus in which nothing withholds cannot detect a `SEP` that binds nothing.
Row 32 is a genuine, measured `quarantine` false positive that this WP does
**not** remove — see "Accepted residuals" item 5, which states the argument for
accepting it rather than leaving the "no argument for even one" claim standing
while the corpus contradicts it. **And rows 42 and 43 are the accepted
metadata-suffix residuals** (residual 6): a sensitive keyword carrying a
word-character suffix such as `_path` or `_id` still binds under A8, so a
path-shaped run and a compact 32-hex UUID still reach `quarantine`. Neither is a
regression — the shipped detector quarantines both today — and both were
measured at zero occurrences on the vault and on this repository's tree.

**This paragraph carried its own count until round 2 of the design gate — "an
equality on four ids" — while C3-5's set had grown to six**, which is the exact
restated-count drift the paragraph immediately above congratulates itself on
having eliminated, one revision after eliminating it. The count is gone rather
than corrected, for the same reason the C3-6 count was: **a count here is a
second decider by construction.** Cite the row; never restate the set.

C3-6 is likewise an **equality on an id set** — the set is **C3-6's own, read
there and stated in no other place, this paragraph included** — because that set
is the measured residual class plus the negative controls that must land at
`redact`, and because "at most" is satisfied by a detector that fires on nothing
(mutation M-3). Round 3 found this paragraph carrying its own count of that set,
one row behind the table it summarizes; the count is gone rather than corrected,
because a count here is a second decider by construction. Two of the ids (25, 27) were added
in round 2: the vault's four distinct redacted runs include two opaque random
tokens, not the "two prose identifiers" an earlier revision claimed, and the
corpus had no reproduction of that sub-class. A `redact` finding costs the user
nothing irreversible — under this WP the note is still withheld and recoverable
from `state/quarantine/`, and once `WP-secret-fence-ep2-redact-arm` lands it is
scrubbed in place with the original preserved — so both equalities are set at the
measured values rather than round numbers, and any drift is visible immediately.

### Table L — canonical: the lookback arithmetic

**Extracted in round 4 of the design gate, and the extraction was mandated rather
than chosen.** Three consecutive rounds produced a finding on this one family:
round 2 found the floor stale after rows 42/43 joined C3-5's set; round 3 found
the repair *restating* C3-5's id set twice in the very commit that wrote "cite
the row; never restate the set" and fixed another cell by that rule. **A fourth
point fix was not available — the recorded escalation says the family's bounds
are the bug.** This table is that repair: **every span, the floor, and what each
literal below it breaks are decided here and nowhere else.**

**The MEMBERSHIP is C3-5's, not this table's.** The rows below reproduce each
member's **measurement** — a different fact from the membership, and the reason
this is not a restatement. **Read which rows are members in C3-5**; round 4
found the previous heading ("the id set is CITED, NEVER COPIED") sitting above a
table that reproduces all six ids, which is a fair thing to call a contradiction. **If C3-5
gains or loses a row, this table is re-measured in the same pass**, and that is
the coupling round 2 discovered by paying for it.

**What a "binding span" is**: the distance in characters from the first byte of
the matched keyword to the first byte of the tier-2 candidate — keyword, filler,
quote slots, separator and the whitespace around it. `hasBoundContext` slices
backwards by `CTX_LOOKBACK_MAX` from the candidate, so a span longer than the
slice cannot bind. Measured 2026-07-27 against a from-spec prototype.

| binding row (C3-5) | keyword | span | notes |
|--------------------|---------|------|-------|
| C2 row 29 | `apiKey` | **11** | Go `:=`, shortest filler of the adopted-separator controls |
| C2 row 30 | `secret` inside `secret_key` | **16** | PHP/Ruby `=>`; **the floor until rows 42/43 existed** |
| C2 row 31 | `TOKEN` inside `API_TOKEN` | **9** | Make `?=`; the shortest span in the set |
| C2 row 32 | `TOKEN` inside `TOKEN_CHARS` | **15** | the accepted alphabet-prose residual |
| **C2 row 42** | `credential` inside `credential_path` | **17** | **the maximum, and therefore the floor.** Keyword + `_path` + `:` + one space |
| C2 row 43 | `token` inside `token_id` | **10** | the compact-UUID residual — **it does NOT move the floor**, and round 3 corrected a claim that it did |

**The BEHAVIOURAL holders are binding spans too, and round 4 of the design gate
found them decided nowhere.** Rows 35 and 37 are not members of C3-5's id set —
they must *not* bind at the shipped filler bound — so the sub-table above does
not cover them, yet the document stated their spans at eight surfaces, two of
which were **registered Table L mirrors under "none of them may restate a
number"**. They are Table L's, and here they are:

| holder row | keyword | span | what the span is for |
|------------|---------|------|----------------------|
| C2 row 35 | `token` inside `token rotation` | **35** | the filler-**bound** control. Its span sits comfortably inside L3, so **it moves under M-5 whether the lookback is derived or a literal** — which is why row 35 alone proves nothing about the lookback |
| **C2 row 37** | `authorization` | **55** | the **lookback-derivation** control, and the only behavioural holder **above the shipped value** — row 35 is the other holder, below it. At mutation **M-5**'s raised filler bound its span exceeds **L3**'s value, so a derived lookback binds it and a literal frozen at that value does not — the slice starts two characters inside `authorization` and no keyword survives. **This cell states the span and no other figure:** the filler bound is Table A row **A8**'s, the shipped lookback value is **L3**'s, and the value the raised bound produces is neither's to print. *Round 6 mandated exactly this reduction and did not apply it. Measured in round 8: the cell was BYTE-IDENTICAL across `da8ed44`, `54a265b` and `a516c77` — extracted from each revision with `git show` and hashed, all three give `db4477a8…` — still restating L3's value twice, M-5's raised bound, and their sum. Applied here.* |

**That asymmetry is the whole of C3-12**: under M-5, rows 35 **and** 37 both
moving is the pass; row 35 alone moving means the lookback is a literal.

| # | fact | value |
|---|------|-------|
| **L1** | **the floor** — the smallest literal lookback under which **every C2 row** still reaches its `Expect` cell (the row count is **C3-0**'s) | **17**, i.e. the maximum span above. A literal at or above 17 is behaviourally indistinguishable from the derived expression *on this corpus* |
| **L2** | what breaks below the floor, measured row by row | **16** → row **42** alone misses; **15** → rows **30** and **42**; **14** → rows **30**, **32** and **42**. Each miss drops that row out of C3-5's set and fails its equality |
| **L3** | the shipped value | the expression `21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 12` evaluates to **53** at the shipped bound — comfortably above L1, which is why **no main-suite row can see the difference** between the expression and a literal today |
| **L4** | what the floor does **not** hold | **L1 is a corpus fact, not a contract.** A literal at 17 passes every row here and is still wrong: the *form* is Table A's (an expression over `ScanLimits`, never a result), and V-2e pins the declaration line for exactly that reason. **Do not read L1 as a licence to write 17** |
| **L5** | the behavioural holder above the shipped value | **C2 row 37** — its span is in the sub-table above and the asymmetry it produces under **M-5** is stated in full in **C3-12**. This row is a pointer to both and states neither. *Round 5 wrote the figures a second time here; round 6 reduced it to a pointer and round 7 removed the last restatement of the slice sentence* |

**Its mirrors, and they are citations only.** **The numeric mirrors,
re-enumerated in round 6 after three of them were created unregistered in round
5 — and no longer claiming to be the complete set, because this document's own
rule forbids a completeness claim without a derived check.** V-32 is that check
for *registration*; nothing derives *this* list, so read it as the enumerated
ones and add on sight:
**the "Four canonical numeric surfaces" table** (its Table L row) and **the
Contract-reference family index** (its Table L row) — both of which describe
what Table L decides and were missing from this list until round 7;
the Implementation-notes paragraph "Why the derivation and not the arithmetic
result" (which keeps the *reasoning* and carries **no span, no floor, no
lookback value and no id set**); **the Implementation-notes section "Why V-2e is
a whole-line pin"**, which is where V-2e's rationale now lives; **V-2e**'s
remaining one-line comments; **C3-12**; **M4e's lookback row**; **C2 row 37's
cell**; **M-5**'s cell; and **the A8-clause bullet under "Table A mirrors"**.
**None of them may restate a number from this table**, and a new one is
registered here on the spot — which round 5 did not do, three times.

### Completeness registers and what actually bounds each

**Read this before adding another mechanism to this document.** Three
consecutive review rounds have found the same shape here: a hand-maintained
register is found short, it is replaced by a *mechanism*, the mechanism's own
input turns out to be hand-maintained one level down, and **each round's prose
claimed the regress had ended.** Round 3 replaced M4e's clause register with an
assertion; round 4 replaced `pin_once`'s five hand-listed figure pins with a
generated sweep — filtered through a hand-written vocabulary of figure shapes;
round 5 deleted that vocabulary and the `[C]` markers, and then found the id
allocation making the same move at the level above.

The honest end of that regress is not another turtle. It is this table, which
names each one. **One row per completeness register in this document, stating
the mechanism, the residual hand-maintained input, and whether the claim is
`complete` or `superset`.**

**The rule this table enforces: no register may claim `complete` unless its input
is DERIVED.** "Derived" means the checker reads the decision itself, rather than
reading a second copy of it that somebody keeps in step. Exactly one register
below qualifies, and the contrast is the useful part.

| register | mechanism | residual hand-maintained input | claim |
|----------|-----------|--------------------------------|-------|
| **the Deliverables prohibition list** (V-14) | `scripts/boundary-check.js` **parses the Deliverables table itself** and rejects any changed path not in it | **none for the enforcement.** The table's rows are a decision, not a copy of one; the prose prohibition list beside it is a message, not the gate | **complete** — the only one here, because the checker reads the decision |
| **the restatement sweep** (V-15) | digests the entire non-block residue of both documents; **selects no line by content**, so no list can be short | its **region**: two named files, and on the spec side everything except (a) the fenced ` ```bash ` blocks and (b) the frontmatter `status:` line. Exclusion (a) is forced — `SWEEP_EXPECT` lives inside one, and a sweep reading its own expected value cannot converge. **Exclusion (b) is round 1's deadlock repair** and is exactly one line wide: `status:` is lifecycle bookkeeping the orchestrator moves twice per WP, and sweeping it made this spec's own Definition-of-done items 1 and 4 jointly unsatisfiable. V-15's negative probe 2b holds the width from both sides — **and the probe itself needed repairing twice before that claim was true.** Round 2: its first form built its comparison copies with a `Draft`-only substitution, so it went vacuous the moment this spec flipped to `Ready` and stayed vacuous for the spec's whole post-dispatch life; it now normalizes the status to each of the three values in turn, measured red and green in both spec states. Round 3: its negative half perturbed `epic:` alone while claiming to prove all seven non-status keys swept — true, but proven for one seventh, and blind to a widened exclusion that hides an `adrs:` edit (executed). It now loops over every non-status key | **superset over its region.** A figure restated as prose *inside* a ` ```bash ` block is not swept, and neither is the `status:` value. **Round 5's review found prose in a bash block — V-2e's ~30-line rationale, a registered Table L mirror — so the "nothing puts prose there today" clause was false, and it had been false while two rounds of figure sweeps certified the document clean.** Round 6 applied this row's own remedy and **moved it out rather than widening the sweep**; the rule stands, and it now has a worked instance rather than an assumption. Every other frontmatter key — `id`, `title`, `depends_on`, `adrs`, `epic`, `size`, `model` — **is** swept, which probe 2b asserts rather than claims |
| **the A8 / M4e clause register** (V-29, C3-18) | digests Table A row A8 whole and the M4e register whole, so **any edit to either fails the build** and forces a reconciliation pass | the **pairing**. Nothing derives register rows from A8's clauses; a clause already written with no row stays missing silently, and that is what rounds 3, 4 and 5 each found, two clauses at a time | **not complete — change-detecting.** It guarantees notification of future drift, never that today's baseline agrees |
| **the M-/V- id allocation** | **THE ALLOCATION PROCEDURE, run** — under "Verification steps". Per prefix (M and V enumerated separately, because one sorted list reports whichever prefix holds the larger numbers and hides the other); **definition-shaped** (a mutation TABLE ROW, a verification STEP HEADER — never a mention, which is what makes it self-excluding by construction rather than by an exclusion list); and **collision-detecting** (each leg enumerated separately, failing on any cross-leg definition outside the inherited shared set, where `sort -u` over a concatenation deduplicated the collision away) | **the moment it is run**, and **the inherited shared-V set** — `V-1 V-10 V-11 V-18` — which is a decision the procedure asserts rather than derives. *Round 8 corrected this cell's previous claim that "no check inside this leg can see the sibling's ids at all": the procedure reads both files, and the reviewers' two-file grep is what falsified the claim. What is true is narrower — no check an IMPLEMENTER runs inside one leg may assert the sibling's allocation as a standing fact, because the One-Document Rule (ADR-0005) forbids opening the sibling; the procedure is an architect/orchestrator act on both files at once.* | **not complete — valid only at the instant it is run.** It is a measurement, never a reservation, and **no surface in either leg states its output any more**: round 7's dated snapshot declared `M-52` free in the same commit that defined `M-52` here, which is the fourth collision this epic has paid for and the second a written-down figure caused. A leg-tagged id scheme would make collisions structurally impossible rather than detected; it is recorded as a follow-up candidate, not done, under "Verification steps" |
| **Table C's corpus** (C1, C2; C3-0, C3-5, C3-6) | counts asserted against the fixture module's own length; `quarantine` and `redact` dispositions asserted as **equalities on id sets**; each mutation asserted as an exact multi-row outcome | **which shapes get a row at all.** The corpus is a hand-chosen sample of measured classes, and C2's own header requires every `Expect` cell to have been *executed* — so a clause with no executed row has no row | **superset of the classes it contains.** Complete over its own rows and over nothing else. **The worked example moved in round 1 of the design gate and the replacement is the honest one.** It used to be the pre-separator quote slot, a *clause* with no row; that is now C2 row 44. What replaced it is a *class* with no row, found by an adversarial reviewer rather than by this register: the metadata-suffix binder residual, which existed under A8 from the moment A8 was written and which no corpus row reproduced until rows 42 and 43 were added. **A clause with no row is something this document's own registers can find; a class with no row is not**, because the corpus does not know what it is missing — that asymmetry is what this row's `superset` claim means and why it can never become `complete` |
| **the in-fence canonical-mirror rule** (Table J row **J5**) | a **hand-written figure vocabulary**, grepped over this document's fenced blocks and dispositioned by a human | **all of it.** The vocabulary is the same kind of input round 5 deleted from V-15 and this document elsewhere condemns; it survives here because the figures it looks for are this leg's own and cannot be shared with the sibling without creating a cross-leg mirror. **It is executed by no V-step** — the grep sits beside the rule and a human runs it | **not complete — a disclosed manual spot-check.** *Round 9 added this row: round 8 asserted the rule with the vocabulary as its warrant and gave it no register row, which is the exact move this table's own closing rule forbids* |
| **the Mirrored Surface Checklist** | **V-32**, which derives the *membership question* rather than the answer: it parses every table in this document, requires each to carry a schema disposition (`ids` — its first cells are contract ids that must be registered — or `data` — its rows are corpus/measurement data and the TABLE is what the Checklist registers, by a name V-32 asserts is really in the region), enumerates the accepted-residual ordinals, **fails on a table with no schema entry, on a first cell its table's pattern does not match, and on any id defined twice** | **two things, and round 8 states both rather than the round-7 cell's "none — a hand-written list".** (1) **The disposition per table** — one decision each, written in the schema, visible in the diff; the *set* of tables is derived, the *classification* is not. (2) **What "registered" means:** any `\b`-bounded mention of the id anywhere inside the Checklist region, tested against the region with whitespace collapsed. That is a PRESENCE test, not an agreement test — an id named in a bullet whose mirror set is wrong or stale still counts as registered | **not complete — it guarantees nothing is UNNAMED, and nothing more.** *Round 7 wrote this row as `none — a hand-written list of surfaces` in the same pass that mechanized it, which is this table's own forbidden move in reverse: a register that started deriving its input and did not say so. Round 8 also measured what round 7's enumerator actually saw — its regex could not match an id with a digit before the hyphen, so **all twenty Table C3 rows were outside the set it reported "0 unregistered" over**, and twelve of them were genuinely unregistered.* Its M1–M6 bullet was presented as complete in round 3 and was short by at least six surfaces; it is explicitly illustrative, with V-15's sweep doing the work it used to claim |

**What to do with a `superset` or a `not complete` row.** Nothing, unless a
review finds a specific gap. These are not open defects; they are the stated
price of each mechanism, and the alternative to stating them is the last three
rounds. **What is forbidden is a fourth round in which one of these registers
quietly re-acquires the word "complete" in prose** — if a mechanism genuinely
starts deriving its input, this table's row changes in the same pass and says how.

### Mirrored Surface Checklist

Every surface in this spec that mirrors a canonical table, so that a review
finding updates the table **and all of its mirrors** in one pass, and any new
mirror found in review is registered here on the spot.

**The round-2 rule, learned the expensive way: a mirror may cite a table row id;
it may not restate a number the table decides.**

**NO NEW ABSOLUTE WITHOUT AN EXECUTED CHECK BESIDE IT — round 7's standing
rule, and it is written here because three of round 6's blocking findings were
that one class.** "Every", "none", "only", "the full set", "no surface may" —
each of those is a claim about the *whole document*, and a claim about the whole
document that nobody ran is a claim that the next review falsifies. Round 6
shipped three: *"No surface in this document may say it does"* (falsified at two
canonical cells), *"The full set"* (missing two members), and *"rejects every
literal"* (true only of the declaration line). **So: write the absolute and the
grep in the same edit, or write neither.** **The mechanized example in this
document is `V-32`** — the Checklist's own membership — and two more absolutes
acquired their executed check in round 8: V-2e's slice-site pin, and the
in-fence figure grep beside V-15's "no canonical mirror lives in a fence" rule.
Another absolute with no check is a defect on sight, whichever surface carries
it. *Round 7 wrote "the three mechanized examples in this document are V-26 …,
V-30/V-32 … and V-31 …". **Not one of those three ids is defined in this
document**, and that is measured rather than asserted:
`grep -ohE '^# V-[0-9]+[a-z]? '` over this leg's verification block returns
`V-1 V-2 V-2b V-2c V-2d V-2e V-3 V-6 V-7 V-8 V-10 V-11 V-12 V-14 V-15 V-18
V-19 V-21 V-29 V-32` and nothing else. Item 4 of the id convention forbids this
document saying whose the other three are; the sibling leg does carry its own
equivalents, and which ids they wear is not this document's to state.* Four of round 2's blocking
findings were one defect wearing four hats — a count copied into prose and left
behind when the table moved. Registering a numeric mirror is not enough, because
nothing forces it to agree. The four numeric surfaces and their disjointness are
stated at the head of "The measurements this design rests on"; a review that
finds a bare number outside Table A, Table C3, Table L or M1–M6 should treat it
as a defect on sight.

**This checklist is itself a hand-written register and is the weakest one in the
document** — see its row in "Completeness registers and what actually bounds
each" above. Where a bullet below names a mechanism, that table, not the bullet,
decides what the mechanism actually guarantees.

- [ ] **"Completeness registers and what actually bounds each"** mirrors: this
      checklist's intro (just above) and its M1–M6 bullet; the M4e
      "reconciliation, not completeness" paragraph and the register table's own
      preamble; the C2 group prose that introduces rows 35–41 and 44; Table C3 rows
      **C3-0**, **C3-5**, **C3-6** and **C3-18**; the V-14, V-15 and V-29
      comment blocks; and Table A row **A8**'s header cell. **Every one of those
      describes a mechanism whose limits that table decides** — if a mechanism
      changes, its row changes first and these follow in the same pass. A
      surface that claims a register is `complete` without a matching `complete`
      row in that table is a defect on sight, and it is the specific defect
      rounds 3, 4 and 5 each shipped.

- [ ] **Table A** mirrors — **THE REGISTRY.** This bullet is the list, and
      nothing else; the round-by-round history that used to be interleaved with
      it is the bullet below. Update every entry here in the same pass as any
      Table A edit.
      **Code and contract:** the "Exact contracts" `entropyPass` code block
      (which restates A1–A6 and A9); the `hasBoundContext` block (which **cites**
      A7/A8/A8a rather than restating them — keep it that way); the `add`
      escalation block (which restates A15 in code — the *only* place A15 is
      shown, and it must stay a restatement of the row, not a second decision);
      **the "A8a — the disposition of every member" sub-table**, which is part of
      the canonical decision rather than a mirror of it, and whose right-hand
      column is the register of which surface holds each member.
      **Deliverables:** the row for `src/core/secret-scan.js`; the row for
      `tests/unit/secret-scan.test.js` (which line numbers change).
      **Prose:** "The glossary edit, exactly" (cites A5/A6/A8/A9/A10 and
      deliberately carries no digit); the Current-state severity inventory; the
      "Where this WP's rules sit relative to that line" bullet under Out of
      scope; **the Implementation-notes paragraph deriving `hasBoundContext`'s
      lookback**, which must keep showing an **expression over `ScanLimits`**
      rather than a result, in the declaration *and* in the maximal-binding
      sentence beside it.
      **Acceptance criteria:** AC-1 … AC-6, AC-17, AC-18.
      **Verification:** V-2, V-2b, V-2c, V-2d, **V-2e**, V-3, V-12, V-19, and
      **V-29**, which digests A8's row whole.
      **Mutations:** M-1, M-2, M-3, M-5, M-6, M-13, M-14, M-15, M-34,
      M-35, M-36, M-37, M-38, M-39, M-40, M-41, **M-42**, **M-43**, **M-44**,
      **M-52** (round 7 — the dead-declaration mutation that makes V-2e's
      use-site pin distinguishable from its declaration pin).
      **Measurements:** M4a, M4b, M4c, M4d, M4e and **M4f** — if A8a's set or
      A16's rule changes, those blocks are wrong, not merely stale.
      **A future revision that moves a clause of A8 moves, in one pass:** its
      M4e register row, its C2 row, its C3 row (C3-12 … C3-17, **C3-19**) and its
      mutation row (M-5, M-13, M-36, M-37, M-38, M-39, **M-44**) — or, where the clause is held by
      the main suite instead, its C3-5/C3-6 consequence and M-42. A revision that
      ADDS a clause moves A8's digest, so **V-29 stays red until the register row
      is added too**.
- [ ] **Table A** mirrors — **HOW THIS REGISTRY WAS ARRIVED AT** (round history;
      no surface is registered here, and none should be added here).
      **The lookback paragraph** was registered in round 3, when it was found
      restating A8's filler bound and computing the lookback value from it with
      nothing forcing the code to agree. Round 3's second pass then found that
      paragraph's *rationale* false as well — a hard-coded lookback does not make
      M-5 a no-op, because C2 row 35's binding span is well inside it — so the
      lookback acquired a behavioural holder (C2 row **37**) and V-2e was
      rewritten from two vacuous greps into an exact line pin. An unenforced
      numeric mirror is how an implementer could have made M-5 a no-op twice
      over.
      **M4e's completeness claim has now failed three times, and what replaced
      it is narrower than any of the three claimed.** Round 3 found the register
      naming two clauses of four; round 4 found it naming seven of nine; round 5
      found round 4's `[C]`-marker repair blind to an unmarked clause and to two
      clauses behind one marker, and found two further clauses unheld (the
      case-insensitivity of the keyword match, and the pre-separator quote slot).
      The markers are gone. **V-29** pins row A8 WHOLE and the M4e table WHOLE,
      each by digest, as **C3-18** decides — which makes every future *edit* to
      either surface fail the build, and does **not** audit the pairing that
      already exists. That distinction, and the same one for every other register
      in this document, is stated in "Completeness registers and what actually
      bounds each" above; **do not restore the word "complete" to this bullet.**
- [ ] **Table L** mirrors — registered in the pass that created the table.
      **Every one of them is a citation and none may carry a number**: the
      Implementation-notes paragraph "Why the derivation and not the
      arithmetic result" (which keeps the reasoning and carries **no span, no
      floor, no lookback value and no id set**); **the Implementation-notes
      section "Why V-2e is a whole-line pin"**, which is where V-2e's
      rationale moved in round 6 and which is a Table L mirror in its new home
      exactly as it was in its old one; **V-2e's remaining one-line
      comments**; Table C3 row **C3-12**; **M4e's lookback row**; **C2 row
      37's cell**; mutation **M-5**'s cell; and **the A8-clause bullet under
      "Table A mirrors"**. *Round 5 created three of these unregistered — the
      register-on-the-spot rule applies to a table's own author too.*
      **A mirror of this table may not live inside a ` ```bash ` fence**: the
      residue sweep cannot see there, which is how V-2e's block went stale
      under two clean sweeps.
      **The two INDEX tables, registered here in round 8 — and where they were
      registered before is the finding.** **The "Four canonical numeric
      surfaces" table** (its Table L row) and **the Contract-reference family
      index** (its Table L row) were registered in round 7 **inside Table L's
      own mirror paragraph**, which sits above this Checklist and is therefore
      outside the region V-32 reads. A registration the registration checker
      cannot see is not one. Both are now here, which is what V-32's rebuilt
      per-table schema found by refusing to pass.
      **The rows themselves, registered in round 7 because V-32 refused to
      pass without them** — and that refusal is the mechanization earning its
      place on its first run: **L1** (the floor) is mirrored by C3-12 and by
      the Implementation-notes paragraph; **L2** (what breaks below it) by
      nothing else, deliberately — it is the one row with no mirror and V-32
      is what will notice if one appears; **L3** (the shipped value) by V-2e's
      section and by M-5's cell; **L4** (the floor is not a permitted value) by
      Table A row A8's form clause and by V-2e's section; **L5** (the
      behavioural holder) by C3-12 and C2 row 37's cell. **Table L is itself a C3-5 mirror in one direction only** — its
      rows ARE C3-5's id set, so a row joining or leaving that set re-measures
      this table in the same pass, which is the coupling round 2 discovered
      by paying for it and round 3 found again in the repair.
- [ ] **Table C** mirrors, **all of them by row id, none of them by number**:
      the "Measurements" M6 paragraph; the Deliverables rows for
      `tests/fixtures/secret-corpus.js` and `tests/unit/secret-fence.test.js`;
      acceptance criteria AC-11 … AC-13; the Mutation checks table; verification
      V-6; "Accepted residuals" (residual 1 cites C3-3, residual 2 cites C1's
      `labelled?` column, residual 3 cites C3-6, residual 5 cites C2 row 32, and
      **residual 6 cites C2 rows 42 and 43** — none of them states a figure of
      its own); the C2 prose that opens the
      corpus (its **row count** is C3-0's and its **group boundaries** are the
      corpus's own) and the paragraph that closes it (which names which rows move
      under which mutation, by id); **the escaping notes after that paragraph,
      which now cover rows 41 and 44 as a pair** — both are rows whose data
      contains two adjacent quote characters, differing only in which side of the
      separator they sit, so writing either one wrong silently converts it into
      an ordinary row and the pair stops discriminating the two slots.
      **Registered in round 2 of the design gate — and round 3 corrected the
      DIAGNOSIS, which is the sharpest argument for round 4's extraction.**
      The surface is **the Implementation-notes lookback paragraph** ("Why the derivation
      and not the arithmetic result"), **together with V-2e's comment copy of
      the same figure.** That paragraph states a *measured floor* over "the rows
      that must bind", so **every C2 row added to C3-5's id set can move it** —
      **row 42 did** — measured, its span is the maximum and row 43's is well
      below it, so only one of the two moved anything — and no surface was
      updated because this bullet did not list the paragraph. It is a Table C
      mirror in the strict sense (its figure is derived from C3-5's id set) even
      though it lives under Implementation notes, and a review that adds or
      removes a binding row updates it in the same pass. **Escalation note from
      round 2: a third finding on the A8 register/bounds family means the
      register's bounds are the bug, and the repair is a canonical extraction of
      the lookback arithmetic rather than another point fix.**
      **Registered in round 1 of the design gate: rows 42, 43 and 44 and their
      whole mirror set.** Adding three C2 rows moved **C3-0** (the row count),
      **C3-5** (rows 42/43 join the `quarantine` id set), **C3-6** (row 44 joins
      the `redact` id set), **C3-17** (M-39 now moves two rows), **C3-19** (new),
      the M4e register's quote-cardinality and optional-whitespace rows,
      mutation rows **M-1**, **M-39** and **M-44**, and accepted residual 6. That
      enumeration is the pass, and it is written out so a later round can check
      the pass happened rather than trust that it did.
      **Registered in round 3's second pass: the "Why the C2 dispositions are set
      there" block that follows Table C3.** It was never on this list, and that
      omission is the whole reason it was still stating a count of C3-6's id set
      one row behind the table — a stale mirror surviving three rounds of "defect
      on sight", found four times. It now cites `C3-6` and carries no count. **If
      a review moves a C3 row, that block is a mirror to update in the same
      pass**, exactly like the Deliverables cells and the acceptance criteria.
- [ ] **EVERY TABLE C3 ROW, one by one — registered in round 8, and the reason
      they were not registered before is the reason V-32 had to be rebuilt.**
      Round 7's enumerator regex was `[A-Z]{1,3}-?[0-9]+[a-z]?`, which cannot
      match an id with a digit BEFORE the hyphen, so **all twenty C3 rows were
      invisible to it** — the step reported "0 unregistered" over a set that
      never contained them. Executed in round 8 with the schema-derived
      enumerator, **twelve of the twenty were genuinely unregistered**: C3-1,
      C3-2, C3-4, C3-7, C3-8, C3-9, C3-10, C3-11, C3-13, C3-14, C3-15 and
      C3-16. Each with its mirror set, so the walk is checkable rather than
      claimed — **C3-0**, **C3-3**, **C3-5**, **C3-6**, **C3-12**, **C3-17**,
      **C3-18** and **C3-19** were already registered above and keep their
      entries there:
      **C3-1** (tier membership, absolute literals) — Table A rows **A1**,
      **A2**, **A3**; the "Exact contracts" alphabet declarations; **AC-2**;
      mutation **M-34**, which is the row that makes it absolute rather than
      relative.
      **C3-2** (the FN matrix) — **AC-11**; Table C1's `/`? column; **C3-3**,
      which is the enumeration of its permitted exceptions; the M6 paragraph;
      mutation **M-35**.
      **C3-4** (labelled-rule coverage) — **AC-12**; Table C1's `labelled?`
      column; accepted residual 2; mutations **M-6** and **M-35**.
      **C3-7** (the transcribed `today` column) — "Why no dependency on
      `WP-secret-scan-baseline-oracle`"; the Deliverables row for
      `tests/unit/secret-fence.test.js`.
      **C3-8** (`SEVERITY.REDACT` producers, counted as OCCURRENCES) — Table A
      row **A13**; **AC-6**; verification **V-2b**; **and V-2e's own note on
      why its three whole-line pins may count lines**, added in round 8: an
      anchored `^…$` pattern matches at most once per line, so occurrences and
      lines coincide there and the rule is honoured rather than waived.
      **C3-9** (severity escalation, both line orders) — Table A row **A15**;
      the `add` escalation code block; **AC-18**; mutation **M-15**.
      **C3-10** (the vertical bar in `SEP`) — Table A row **A8a** and the A8a
      disposition table's bar row; C2 rows 26/27/28; **M4a**; mutation
      **M-14**.
      **C3-11** (the one-character `SEP` cliff) — the A8a disposition table's
      adopted-token rows; C2 rows 29/30/31; **M4c**; mutation **M-40**.
      **C3-13** (A8's filler CLASS) — A8's filler-class clause; **M4e**'s
      filler-class row; C2 row 36; **M4b**; mutation **M-13**.
      **C3-14** (A8's SAME-LINE clause) — A8's same-line clause; **M4e**'s
      same-line row; C2 row 38; mutation **M-36**; **and the V-2e pin named `LINE_LINE`,
      which is the slice site's own same-line trim** — named rather than
      numbered, because round 8 called it "the second of three" and the code
      makes it the third.
      **C3-15** (A8's ADJACENCY clause) — A8's adjacency clause; **M4e**'s
      adjacency row; C2 row 39; mutation **M-37**.
      **C3-16** (A8's separator CARDINALITY) — A8's separator-cardinality
      clause; **M4e**'s separator-cardinality row; C2 row 40; **M4f**, which is
      the one clause of the group with a measured `docs/` false positive;
      mutation **M-38**.
      **A future revision that moves any of these moves its mirror set in the
      same pass**, and V-32 is what refuses to pass while one is unnamed.
- [ ] **M1–M6** mirrors — **and this bullet no longer enumerates them, which is
      the round-4 structural fix.** Every out-of-block restatement of a vault
      figure, in this document and in ADR-0034, is registered by **V-15's
      residue sweep**: it strips the ranges the block digests already cover and
      digests EVERYTHING that remains, figure-bearing or not. There is nothing
      to keep in step by hand, and a restatement added anywhere reddens V-15
      instead of passing silently.
      **The measurement TABLES themselves are named here in round 8**, because
      V-32's per-table schema dispositions each of them as corpus/measurement
      data whose registration is the table rather than its rows, and then
      asserts the name is really in this region: **M3** (the slash-fragmentation
      draw), **M4**, **M4a**, **M4b**, **M4c**, **M4d**, **M4e** and **M4f**.
      Round 7's bullet wrote the range "M1–M6", which contains no substring a
      checker can match against **M3** — a range is not a registration.
      Named here only because they are the mirrors a reader will look for: the
      Context section's third paragraph (which restates
      M1's headline because an implementer must see the reason this WP exists in
      the first screenful); the A15 escalation note, which mentions how many
      vault notes carry its benign carrier prose; "The
      interim behaviour" section, which names M5a's derivation **in words and
      carries no digit** — keep it that way; the Deliverables row for
      `scripts/measure-secret-fp.js`; verification V-7 and V-15. **That list is
      illustrative, and saying so is the point** — the previous revision
      presented its equivalent as complete and it was short by at least six
      surfaces, which is what the sweep replaces.
      **V-15 covers BOTH files**, this one and ADR-0034, so an edit to either
      copy of M1's or M5's evidence turns this WP's verification red. An earlier
      revision claimed that symmetry while V-15 greped only the ADR, which meant
      the Context paragraph could drift freely. **Round 3's second pass replaced
      the per-line pins on the evidence blocks with WHOLE-BLOCK DIGESTS**, the
      V-18 pattern: the old form pinned 2 of the 7 lines of the M1/E1 block, and
      three constructed drift states passed it green while the two documents
      disagreed (a `distinct high-entropy runs` count differing between files;
      the `high-entropy ONLY` and `findings by rule` lines edited apart; ER-4
      itself rewritten to contradictory figures), as did a fourth attack needing
      no drift at all — two contradictory claims on ONE line, which `grep -c`
      counts as 1. **M1 and E1 share ONE digest, which pins their equality as
      well as their content**; M5 and E3 carry one each. **A block digest has no
      per-line pin to forget when a line is added**, which is what all four
      failures had in common. If you add a line to any of those blocks, the
      digest moves — that is the mechanism working, and only the architect
      recomputes it, in the same pass as the ADR errata amendment that justified
      the change.
      **Round 4 removed `pin_once` entirely.** It pinned five hand-listed
      out-of-block figures under a written claim to cover "every place either
      document states a vault figure outside a digested block", and that claim
      was false: six constructed drift states passed all six digests and all
      five pins while two copies disagreed, one of them the ADR's own
      "Alternatives considered" bullet, which errata row ER-4 names as a surface
      it corrected. **The lesson is the one ADR-0031 already carries and this
      document has now paid for twice: a register that a human maintains does
      not converge.** **Round 5 found that the sweep replacing `pin_once` had
      kept the register one level up, as a hand-written vocabulary of figure
      shapes**, and measured it short: a restatement using `100`, `101`, `80` or
      `299` left the digest byte-identical and V-15 green. The vocabulary is
      gone; the sweep digests the whole non-block residue of both documents,
      selects no line by content, and therefore has no list that can be short.
      **What it still takes by hand is its REGION, not a list** — two named
      files, minus the fenced ` ```bash ` blocks on the spec side (an exclusion
      forced by the fact that `SWEEP_EXPECT` lives inside one) and minus the
      frontmatter `status:` line. **The second exclusion is round 1's deadlock
      repair, and it is registered here rather than buried in the step**: the
      sweep covered this document's own frontmatter, so both status transitions
      the Definition of done mandates moved the digest — measured, `Draft`,
      `Ready` and `In-Review` produced three different values — which made the
      act of flipping this spec to `Ready` redden the gate that authorises it.
      The exclusion is one line wide and V-15's negative probe 2b holds it there
      from both sides. So the claim is "complete over its region", never
      "complete"; the row for this gate in "Completeness registers and what
      actually bounds each" states exactly what that leaves out. **The cost is
      stated in V-15 and is not
      small — it is a HIGH-CHURN gate**: any prose edit reddens it and the
      architect recomputes in the same pass, which is strictly cheaper than a
      silent contradiction nobody recomputes at all.
- [ ] **ADR-0034** (`docs/adr/0034-accidental-persistence-threat-model.md`) is a
      mirror of this spec in both directions, and after the split it is also the
      **hub** through which this leg and `WP-secret-fence-ep2-redact-arm` stay in
      agreement without reading each other. Its mirrors here: the "The threat
      model" section and the review-criterion block (ADR-0034 Decisions 1–5); the
      Out-of-scope shape-allowlist bullet (Decision 7); the Current-state
      description of what EP2 does today; **M1 ↔ E1 and M5 ↔ E3, pinned by
      V-15**. ADR-0034's Decision 6 states the EP2 principle and **defers to
      Tables A and B for the exact contract** — so a table edit is normally free,
      but an edit that made A5/A6/A10 contradict Decision 6 is a **new-ADR
      event**, not a spec revision. Say so in review rather than editing either.
      **What "Accepted, therefore immutable" does and does not cover** — settled
      in round 2 and recorded in the ADR's own errata block: its **Decisions 1–7
      and its `OWNER-SIGNED` line are immutable** and only a new ADR touches
      them. Its **measured evidence (E1–E4) and Boundary statement are not**:
      when a measurement is found to be wrong, the correct repair is a dated
      **errata amendment inside ADR-0034**, because fixing it only on the spec
      side would promote this document's copy to primary and leave the durable
      record stating a false figure. Round 2 exercised exactly that path for E4's
      arithmetic and for the "EP1/EP3 are byte-unaffected" claim. An errata
      amendment never touches the signature and never changes what was decided.
      **Round 3 added two entries to that ADR, both of them evidence or status
      rather than Decisions.** (i) A `## Not yet committed` status note recording
      that the ADR had never been committed, and that the durable-record argument
      above was therefore being made about an uncommitted file. **That note's
      premise expired on 2026-07-26**: the ADR landed in `7ef4c51` and the
      argument is now made about a committed file — see "ADR-0034 LANDED IN
      `7ef4c51`" under "The measurements this design rests on". The note itself
      is left in place and is **not** edited from this leg: `docs/adr/*` is
      outside the Deliverables table in both directions, the note is a dated
      record rather than a live claim, and deleting it would move V-21's
      precedent range (see V-21's own terminator argument, which is built around
      exactly this section being deletable). Retiring it is an architect act
      inside the ADR, disclosed there, not a spec edit. (ii) A named
      **precedent for the one Decision-section edit the ADR already contains**:
      the "Cross-reference update" block repaired a dangling file name inside
      Decision 6's closing paragraph. That is permissible, and the ADR states the
      conditions under which it is, so that the next round inherits a rule
      instead of an example.
      **Round 3's second pass tightened that precedent to FIVE conditions and
      gave it a gate.** (1) A dangling cross-reference only — **and explicitly
      NOT another document's contract-table row id**: repointing "Table B rows
      B4/B5/B10" at renumbered rows changes which contract the Decision governs
      while reading exactly like a typo repair, so only the *document name* in
      such a citation may be repaired. (2) No change of meaning, **with the
      pre-edit text quoted verbatim in the disclosure** — nothing else makes that
      claim falsifiable once the old bytes are gone. (3) Dated and disclosed in
      the errata/cross-reference section. (4) Never the `OWNER-SIGNED` line, never
      a Decision added, removed or re-scoped. (5) **The architect and nobody
      else** — never an implementer, for whom `docs/adr/*` is outside the
      Deliverables table and a red ADR gate is a stop-and-report. The ADR's own
      "no agent may ever amend either" sentence and this licensed exception are
      reconciled in place, in both documents: "amend" is about what a Decision
      *asserts*; the exception is about a *pointer inside it that no longer
      resolves*. Anything failing one of the five is a new-ADR event.
      **And the ADR's Decisions are now digest-pinned by verification V-21** —
      before round 3 nothing in either leg looked at them, so an edit to a
      Decision was invisible to every gate while this very precedent licensed one
      class of such edit. V-21's first digest covers `## Decision` through
      `## The measured
      evidence`. A legitimate condition-1 repair turns it red; the architect
      recomputes the literal in the same pass as the repair and its disclosure,
      and that cost is the point.
      **Round 4 gave the LICENCE ITSELF a digest, for the same reason.** The
      five conditions — condition 5 above in particular, "the architect and
      nobody else" — sat inside no digest at all: V-21's first range starts at
      `## Decision`, and V-15's errata digest matches only lines beginning
      `| ER-`. Deleting six words would have widened the exception to every
      agent with nothing going red, which is V-21's own sentence about
      ungated licences applied to the licence. V-21 now carries a **second**
      digest over that block, and in the same pass the ADR gave the block its
      own `##` heading — it had been parented to a one-off dated
      "Cross-reference update" record, the same structural class the round-3
      correction fixed for the supersedes/re-ratifies paragraphs. Both edits are
      disclosed with their pre-edit bytes in the ADR's
      "Structural correction — 2026-07-26, round 4" block, and so is the third
      round-4 ADR edit: the sentence "no agent may ever amend either" appeared
      **three** times and only one copy carried the exception's qualifier, so
      the other two now point at it.
      **Round 5 repaired that second digest's TERMINATOR and restructured the
      ADR, in one disclosed pass.** Round 4 ended the licence range at the named
      heading `## Not yet committed`, a status note whose own premise expires on
      the commit this WP's dispatch blocker requires; measured, deleting that
      section runs the range **82 → 567 lines** and swallows the Decisions, so
      the gate would redden for the wrong reason and its instructed repair would
      convert a licence digest into a whole-document one. The range now ends at
      **the next `##` heading**, which cannot be deleted, and V-21 gained a
      second probe asserting the range contains **exactly one `##` heading** —
      the old probe asserted only non-emptiness. That count form is what the
      round-5 finding's "must not contain `^## Decision$`" asks for, strictly
      implied and actually able to fire: measured, the appendix move puts the
      Decisions above this section, so a Decision-specific probe would pass on a
      range swollen to end-of-file (5 headings, 0 Decisions), while the count
      discriminates 1 from 5. In the same pass the ADR's amendment
      bookkeeping — the errata blocks, the licence, the status note and the
      structural corrections — moved into an **appendix after
      `## Alternatives considered`**, because 45.8% of that file preceded its
      first ratified heading and the share grew every round. **The moved bytes
      are unchanged and their order is preserved**, so V-21's first digest,
      V-15's errata digest and the M1/E1 and E3 block digests are unaffected and
      were verified byte-identical after the move; only the residue sweep and the
      licence digest move, and both are recomputed here. Both edits are disclosed
      with pre-edit bytes in that file's
      "Structural correction — 2026-07-26, round 5" block, together with a third:
      the round-4 block described an eleven-word clause as "the four words" and
      claimed "No paragraph was reworded" while disclosing a reworded
      parenthesis. Its verbatim quotation was correct; only those two descriptors
      were.
      **That honest limit is DISCHARGED as of 2026-07-26 and the entry is kept
      so the discharge is traceable.** It read: "neither file has ever been
      committed, so no committed baseline exists to diff a Decision against and
      both V-21 digests are pinned to the architect's working copy." Both files
      landed in `7ef4c51`, so `git show 7ef4c51:docs/adr/0034-…md` is a real
      committed baseline and **both V-21 digests are now immutability checks
      against history rather than against a working copy.** Verified at the
      capture point: the ADR is byte-unchanged since that commit, and both V-21
      literals reproduce.
- [ ] **The split boundary** — the fact that this leg changes no gate — is
      mirrored in "The interim behaviour" section, the Provenance
      decision-scope table, the
      Deliverables prohibition list, "Why leg 2 cannot go first", acceptance
      criterion **AC-20** and verification **V-14**.
      **Round 1 of the design gate reduced the Provenance table to DECISION SCOPE
      ONLY and that is the registration, not a note beside it.** It used to carry
      a file list for each leg — an unregistered mirror of the *other* leg's
      Deliverables, which nothing here could check and which had drifted in both
      directions on both sides (this leg named one of leg 2's four tables and
      three of its eleven paths; leg 2's copy omitted `docs/GLOSSARY.md`, which
      this leg edits). **The fix removes the drift surface rather than policing
      it**: the table names canonical tables, each leg's Deliverables is the sole
      enumeration of its own files, and neither leg restates the other's. A
      future revision that re-adds a file column to that table is re-creating a
      mirror ADR-0031 forbids — say so in review. V-14 is the only one of
      those that a machine checks. **A file may not be forbidden in prose and
      unchecked in V-14** — and since round 3 that holds by construction rather
      than by discipline: V-14's enforcer is `scripts/boundary-check.js`, which
      parses the **Deliverables table itself** and rejects every changed path
      that is not in it, so the glob-shaped prohibitions (`docs/adr/*`,
      `docs/specs/*` other than this file, `docs/specs/logbook/*`) are covered
      without being enumerated. The short leg-2 name list that follows it in V-14
      exists only to produce a clearer message and is not the enforcement. The
      **changed set** V-14 feeds it is a registered mirror in its own right: it
      must be built from the **merge base to the working tree, plus untracked
      files**, never `git diff origin/main...`, which compares to the last commit
      and is blind to an uncommitted edit.
- [ ] **The threat-model section** is a mirror of the *other leg's* copy of
      itself, and the only cross-leg mirror in this document. It is held by
      **V-18**, a checksum over the section against a literal digest that both
      legs carry. It is deliberately not held by "read the sibling spec": the
      One-Document Rule (ADR-0005) means neither implementer opens the other's
      file. **If V-18 fails, you edited a ratified review criterion — revert your
      edit; do not update the digest.**
- [ ] **The ADR gate** is mirrored in exactly two places — verification **V-11**
      and Definition-of-done item **0** — and both are **positive** greps (assert
      `Status: Accepted` and the dated `OWNER-SIGNED` line are present in
      ADR-0034). Never restate this gate as "no warning present": that form is
      satisfied by deleting the warning. **This leg's V-11 checks the ADR and
      nothing else** — this spec carries no owner signature and needs none; see
      the Provenance section and the "Owner signature form" table below. **The
      required signature form is published in that table, not only in a bash
      comment** — round 2 found the ADR's line written unformatted precisely
      because the form lived only inside V-11's comment block, where an owner
      would never read it.
- [ ] **The id allocation** — which M-/V- numbers this leg owns, which it has
      vacated, and which are next free — is decided in **one** place, the id
      convention under "Verification steps", and mirrored in exactly two others:
      the **Mutation-checks preamble** (which restates the leg-local range and
      *points at* the vacated number without repeating it) and the
      **"Completeness registers"** row for the M-/V- id allocation. Both defer to
      the convention and neither may state a range the convention does not. **Registered in round 6**, which is the
      worked example of why: renumbering one mutation and one verification
      touched Table A row **A8**, the **A8a** sub-table, **M4e**, Table **C3**
      (C3-6, C3-17, C3-18), this checklist, the mutation table, the C2 group
      prose and **two digest literals**. Every other `M-nn` / `V-nn` citation in
      this document is a *use* rather than a mirror, but a renumbering sweeps all
      of them. **A next-free figure quoted anywhere is a dated snapshot, never a
      reservation** — round 6 found one forward-reserved id (an unwritten
      mutation named in M4e and C3-17) that had to move for exactly that reason.
- [ ] **Tables H and J — THE SHARED CHECK CONTRACTS** — registered in round 9,
      in the same pass that created them. Every entry is a citation; **none may
      restate a pattern or a word set**, because the whole point of the
      extraction is that the steps read them rather than copy them.
      **H1** — this leg's per-table schema, which is where each `ids` table
      declares its own first-cell pattern. **H2**, **H3**, **H4** — the
      registration step's three family matchers, which it reads out of Table H
      at run time and holds nowhere else. **H5** — that step's duplicate branch
      and its negative probes. **H6** — that step's `registered()` helper, its
      `data`-table name test, and both boundary probes. **H7** and **H8** — the
      "Completeness registers and what actually bounds each" row for the
      Mirrored Surface Checklist, which is where the presence-not-agreement
      limit and the per-table disposition are disclosed. **H9** — the step's
      own summary line.
      **J1**, **J2**, **J3**, **J4** and **J6** — this leg's terminology sweep,
      where it has one; **J6** additionally by nothing else, deliberately: it is
      the collision-exclusion row and its only consumer is the sweep's view; a leg without one still carries the contract, for the reason the
      section preamble gives. **J5** — the in-fence canonical-mirror rule and
      its own "Completeness registers" row, which is where its leg-local figure
      vocabulary is disclosed as hand-maintained.
      **Both tables are byte-identical in the sibling leg and V-33 asserts it.**
      An edit to either is a two-leg edit plus ONE recomputation of V-33's
      literal — never a one-sided one, and never a recomputation without the
      matching edit.

### Owner signature form — canonical

V-11 greps for an owner-written signature line. **This table, not the grep, is
what an owner reads to know what to type**; the grep is derived from it.

| # | Fact | Value |
|---|------|-------|
| S1 | the marker | the literal token `OWNER-SIGNED`, followed by a `YYYY-MM-DD` date |
| S2 | position | at the **start of a line**. Leading `>` (blockquote) and `*` (bold/emphasis) characters are permitted and ignored; leading prose is not |
| S3 | separator between marker and date | any run of spaces, em-dashes, en-dashes or hyphens, including none |
| S4 | where it must appear, **for this leg** | `docs/adr/0034-accidental-persistence-threat-model.md`, once. **Not in this spec.** This WP decides nothing that needs owner authority: every one of its rows is governed by ADR-0034's Decisions 1–7, which carry the signature. The EP2-gate leg has its own S4 and its own file |
| S5 | who may write it | **the owner, and nobody else.** No agent writes this line, ever, including to "fix" a red V-11, and including "just to be consistent with the other leg". A red V-11 means the signature is genuinely absent and the WP is not ready to merge |
| S6 | what it is **not** | it is not the `OWNER-RATIFIED IN SESSION` blockquote. That block is an agent's transcription of a decision taken in conversation; a gate keyed on it would be satisfied by the process it exists to constrain |
| S7 | current state, 2026-07-26 | ADR-0034 carries `OWNER-SIGNED 2026-07-25` (S2's plain form, line 6) and V-11 passes. It is the owner's own text and **must not be edited, re-formatted or re-dated by anyone** |

## The shared check contracts — canonical, byte-identical in both legs

**Extracted in round 9 of the design gate, and the extraction was mandated rather
than chosen.** Rounds 4, 5, 6, 7 and 8 each produced a blocking finding of ONE
shape: **the mechanized check is narrower than the absolute written beside it.**
Round 8 answered it twice — a per-table schema on the detector leg, a fifth
hand-tuned regex on the EP2-gate leg — and the reviewers' first adversarial
contact broke the pair in seven executed ways. Under **ADR-0031** a fifth point
fix is not available: when one family produces the blocking finding round after
round, **the family's bounds are the bug and the repair is a canonical
extraction**, exactly as Table L was extracted for the lookback arithmetic.

**These two tables are that extraction. They are stated ONCE and both legs carry
the same bytes.** Under the One-Document Rule (**ADR-0005**) neither implementer
may open the other leg's spec, so each leg carries its own copy — and
**verification step V-33 checksums this section against a literal both legs
carry**, which is exactly the pattern the ratified threat-model section already
uses. An edit to either copy is caught by that leg's own suite. **If V-33 fails,
a shared contract was edited: revert it, or make the identical edit in both legs
and recompute the one literal in the same disclosed pass.**

**The steps are DERIVED from these tables and restate nothing.** Each leg's
registration step reads the canonical patterns out of **Table H at run time** and
builds its matchers from them; each leg's terminology sweep reads its word sets
out of **Table J** the same way. A pattern changed here changes the check. A
pattern changed in a step and not here cannot happen, because the step holds no
second copy to change — which is the property five rounds of hand-tuned regexes
did not have.

**A leg carries both tables even where it has only one of the two steps**, and
that is deliberate rather than sloppy: the contract is what makes the two legs'
checks the *same* check wherever both have one, and a contract that exists in
only one leg is exactly the cross-leg mirror ADR-0031 forbids. **Neither table
names a verification id of the other leg**, per the id convention's rule that no
leg asserts the sibling's numbering.

### Table H — canonical: what a DEFINITION is, and what a REGISTRATION is

**Every row's `pattern` cell is READ OUT OF THIS TABLE by each leg's
registration step.** The cell holds the pattern and nothing else, between
backticks, so the step can split the row on the cell wall and take it verbatim.
**No canonical pattern here may contain a vertical bar**, because a bar is the
cell wall; where an alternation is needed it belongs in the leg-local schema
(row **H1**), not here.

| # | fact | pattern | why it is here |
|---|------|---------|----------------|
| H1 | **a CONTRACT-TABLE definition** — the first cell of a body row of a table the leg's own schema dispositions as `ids`, stripped of its `**` emphasis and trimmed. **No pattern cell, deliberately:** the first cell is delimited by the markdown cell wall itself, which is the table's own structure and not a second copy of anything | `` | The *shape* of an id differs per table and is therefore leg-local: each `ids` table declares its own pattern in that leg's schema, and every body row's first cell must match it, so a mis-shaped id cannot hide. **The shapes that must be admissible, because they all occur:** letters-only (`BU`), letters and digits (`A8a`, `R7c`), a prefix with a hyphen (`FI-19`, `M-24b`), **digits BEFORE the hyphen** (`C3-19`), and a corpus row that is a bare number or a slug. A schema whose patterns cannot express one of those is the round-8 defect returning |
| H2 | **an ACCEPTANCE-CRITERION definition** | `^ *- \[[ x]\] \*\*(AC-[0-9]+[a-z]?)` | Both checkbox states and any indentation, and **the emphasis span is NOT required to close after the id** — measured in round 9, a criterion written `- [ ] **AC-20 (the interim contract).**` is invisible to a pattern demanding `\*\*` immediately, and both legs carry that form. **A ticked box is what an implementer produces by USING the criteria list**, so a pattern matching only `- [ ]` makes every acceptance criterion vanish the moment the list is worked — measured on the EP2-gate leg: all fifteen |
| H3 | **a VERIFICATION-STEP definition** — its comment header inside that leg's verification block | `^# (V-[0-9]+[a-z]?)[ ]` | The step header is the definition; a mention in prose is not. This is also what makes the id allocation self-excluding, since a sentence quoting a figure is neither a table row nor a step header |
| H4 | **an ACCEPTED-RESIDUAL definition** — an ordinal inside the `## Accepted residuals` section | `^([0-9]+[a-z]?)\. +\*\*` | The residual list is ordinal-numbered prose, not a table, so it needs its own family |
| H5 | **DUPLICATE DEFINITIONS FAIL, in every family without exception** — a second definition of an id already defined is an error, whether it is a second table row, a second criterion bullet, a second step header or a second residual ordinal | `` | A collection that keeps only the first definition reports the duplicate as registered, because the first one is. Measured in round 9: a second `Q18` table row and a second residual ordinal `6` each passed green. **`has` before `set`, on every insert** |
| H6 | **REGISTRATION MATCHING IS BOUNDARY-CORRECT** — an id counts as registered only where it occurs with neither an alphanumeric neighbour nor a trailing hyphen | `(?<![A-Za-z0-9])ID(?![A-Za-z0-9-])` | **A plain `\b` is NOT sufficient and this was measured, not assumed:** `/\bC3\b/.test("C3-19")` is `true`, so `C3` would be "registered" by any mention of `C3-19`. The trailing `-` in the lookahead is what closes that. The literal `ID` is replaced by the id, regex-escaped. **An unbounded substring test is worse again** — round 8's by-table name check registered `M4` on any mention of `M4a`, and the detector leg carried 1 standalone `M4` against 28 masked occurrences |
| H7 | **REGISTRATION IS A PRESENCE TEST, NOT AN AGREEMENT TEST** — the id must occur inside the Checklist region, tested against that region with its whitespace collapsed to single spaces | `` | A registration wraps across source lines like any other prose, and a line-local match is the bug this loop has now paid for four times. **What the test guarantees is that nothing is UNNAMED. It has no opinion about whether the naming is correct**, and no surface may read its count as coverage |
| H8 | **THE SCHEMA IS PER TABLE AND MUST BE TOTAL** — every table in the document carries a disposition, `ids` or `data`; a table with no entry FAILS the step | `` | The set of tables is derived by parsing; the *classification* of each is a decision, written in the schema, visible in the diff. That residual is what each leg's completeness-registers row must state. A `data` table's rows are corpus or measurement values: what the Checklist registers is the **table**, by a name the step asserts is really in the region under **H6** |
| H9 | **THE STEP PRINTS WHAT IT CHECKED, INCLUDING WHAT IT DID NOT** — the summary names the count outside both the Checklist and the dated backlog, never "0 unregistered" | `` | The backlog holds ids that are genuinely unregistered mirrors. A summary that calls them nothing is a pasted artifact less honest than the source it came from |

### Table J — canonical: the check vocabularies

**Every row's `members` cell is READ OUT OF THIS TABLE by each leg's terminology
sweep.** Members are whitespace-separated stems, matched case-insensitively;
**no member may contain a vertical bar or a space.**

| # | vocabulary | members | why these |
|---|------------|---------|-----------|
| J1 | **safety words** — the claim side of the sweep | `safe safety safely safest unsafe authoriz` | `safe` alone misses `safety`, and a case-sensitive test misses `SAFETY` — both measured in this loop. Stems, not words |
| J2 | **destructive subjects** — the subject side | `revert withhold destr delet remov K3 K4` | `destro` misses `destructive`; `destr` covers both. **`delet` and `remov` were missing entirely** and a claim reading *"…makes the later deletion of the recovery original completely safe…"* passed green — the same class as the `destro`/`destructive` catch, one word over, and the words the deletion contracts themselves use |
| J3 | **the view the sweep runs on** — the whole file MINUS the sweep's own step and MINUS this table's own rows, whitespace-collapsed, and read through a **SLIDING WINDOW OF THREE CONSECUTIVE NON-BLANK LINES**, fenced code blocks INCLUDED | `` | **A fenced block is not exempt from a claim about the whole document.** Measured in round 9: the EP2-gate leg's fences are 1 192 of 5 293 lines — **22%** of it, and the home of every verification rationale — and a safe/revert claim written as a fenced comment passed green. **The window is three lines and bounded, not a paragraph**, and both halves of that are measured: a paragraph join catches a wrapped claim but a fenced block has almost no blank lines, so paragraph-joining one produces a single 200-line unit in which any `safe` co-occurs with any `revert` — round 9 measured five such false positives on first run. **Blank lines are dropped from the sequence rather than ending it**, which is what closes the blank-line-split bypass without joining unrelated prose. The sweep's own step and this table's own rows are excluded because a sweep that reads its own word lists can never converge |
| J4 | **allowlist discipline** — every permitted surface is registered as an **anchored** substring carrying enough of its own sentence to be unique, and the list is **SUBTRACTED** from the text before the pairing test rather than filtering whole units | `` | A floating clause excuses an arbitrary surface, and unit-filtering lets one registered fragment excuse an unregistered claim beside it — both measured. **An entry that excises nothing is DEAD and is deleted**, proven by removal testing: delete it and the step must go red |
| J6 | **collision exclusions** — literal, case-SENSITIVE tokens excised from the view before matching, because they collide with a vocabulary stem while carrying no claim | `Authorization` | `authoriz` is in J1 to catch *"K4 authorizes the revert"*. It also matches the HTTP header token `Authorization`, which both legs name dozens of times — measured in round 9, three Table P rows fired on `Authorization: Basic` alone. **The exclusion is the capitalized header token only**, so `authorizes` and `authorization` in ordinary prose still match. A stem list cannot express "except this proper noun"; a short, canonical, shared exclusion row can |
| J5 | **the in-fence rule** — a fence may hold rationale about a CHECK; it may not hold a MIRROR of a canonical surface, because the residue sweep cannot see there | `` | The remedy is to **move the prose out**, never to widen the sweep. The figure vocabulary that certifies this rule is necessarily **leg-local** — it names figures that leg's own tables decide — so it is hand-maintained, it is **not** shared here, and the leg that carries it **must carry a completeness-registers row disclosing it as hand-maintained input**. Naming another leg's figures here would create exactly the cross-leg mirror this extraction exists to prevent |

## Implementation notes & constraints

- **Zero new dependencies.** Plain Node ≥ 18, JSDoc types, no TypeScript, no
  build step (CLAUDE.md).
- **`node --test <file>` bypasses `tests/run.js:7`**, the only place
  `WIENERDOG_TEST_NO_REAL_SCHEDULER=1` is set. Always run
  `node tests/run.js <paths>`. Never use `--test-name-pattern` as a gate: with a
  pattern that matches nothing, `node --test` exits 0 reporting `pass 1`, because
  the file wrapper itself counts as a passing test.
- **A test that passes against unmodified `main` is not evidence.** Every
  acceptance criterion below has a row in the Mutation checks table naming a
  one-line change to `src/` that must make it fail. Run them; paste the output.
- **Verification exit status carries the verdict.** A script that prints
  `DIVERGED` and exits 0 is a defect, not a report. Every command in
  "Verification steps" must exit non-zero on failure, and the FN/FP gates must
  `process.exit(1)` (or `assert`) rather than only logging.
- **`hasBoundContext`'s lookback must be COMPUTED FROM `ScanLimits`, never
  written as a literal.** It runs once per tier-2 candidate and slices backwards
  from `idx`, never past the preceding `\n`. Declare it **once, at module scope,
  unindented** — V-2e pins the whole line with `grep -cxF`, so an indented or
  re-spelled copy fails the build. The expression, exactly:

  ```js
  const CTX_LOOKBACK_MAX = 21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 12;
  ```

  `21` is keyword-max-length (`aws_secret_access_key`); the `+ 12` is **slack**
  covering the longest separator token (`:::=`, four characters), the two
  optional quote/backtick characters and the optional whitespace on each side of
  the separator. **That inventory sums to 8, not 12** — the remaining 4 are
  deliberate slack in the fail-safe direction, and the number is called slack
  here rather than derived so that nobody "corrects" it downwards. On the same
  arithmetic a maximal binding is `21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 8`
  characters — **written as that expression and never as its value**, for
  exactly the reason this whole paragraph exists: the filler bound is Table A row
  A8's to decide, so any arithmetic result printed here is a second decider that
  goes silently wrong the moment A8 moves or mutation M-5 runs. An earlier
  revision printed the value; round 3 removed it. An earlier revision also used
  `+ 8` in the declaration itself, which was sufficient only while every
  separator was one character.

  **Why the derivation and not the arithmetic result — and what actually holds
  it (rewritten in round 3; the earlier rationale here was false).** At the
  shipped filler bound this expression evaluates to the value **Table L row L3**
  records. **Do not write that value, and do not write any other literal.**

  The earlier text claimed a hard-coded lookback made mutation **M-5** "a partial
  no-op". Measured 2026-07-26 against a from-spec prototype, that was wrong twice
  over, and both facts are worth stating because they are what the current
  holders are shaped around:

  - **A hard-coded lookback at L3's value does not stop M-5 moving C2 row 35.**
    Row 35's whole binding — keyword, filler, separator, the space before the
    candidate — spans well inside it (**Table L**'s behavioural-holder sub-table
    has the figure), so under M-5 that row rises to `quarantine` on correct and
    hard-coded code alike. Row 35 alone therefore proves nothing about the
    lookback.
  - **At the shipped bound, no behaviour distinguishes a derived lookback from a
    hard-coded one at all**, and it cannot: at `ENTROPY_CTX_FILLER_MAX = 20` the
    derived expression and the literal compute the same number, so they *are*
    the same code. **How far down a literal may go before the corpus notices,
    and which rows notice first, is decided in Table L and is not restated
    here.** The lookback therefore has no behavioural holder at the shipped
    setting, which is why row 37 holds it **under M-5** rather than in the main
    suite, and why V-2e pins the declaration structurally.

  So the lookback is held two ways, and both are needed. (1) **Structurally:
  V-2e pins the declaration line exactly** — the full expression, including the
  `ScanLimits.ENTROPY_CTX_FILLER_MAX` reference — so **any** literal fails the
  build. The earlier V-2e could not do this: its first grep was satisfied by the
  filler-bound interpolation that every conforming implementation already
  contains inside the regex, and its second was satisfied by writing a *different*
  literal. (2) **Behaviourally: C2 row 37**, whose binding at filler bound 40
  exceeds what the expression evaluates to at the shipped bound — **Table L row
  L5 and its behavioural-holder sub-table carry both figures**. Under M-5 a
  derived lookback binds row 37 and rises to `quarantine`; a literal frozen at
  the shipped value starts the slice two characters inside the keyword
  `authorization`, no keyword survives in it, and **row 37 does not move**. That asymmetry is stated in **C3-12** and is what M-5's failure output
  must be read for: rows 35 **and** 37 both moving is the pass; row 35 alone
  moving means the lookback is a literal.

  **This paragraph is a registered mirror TWICE OVER, and naming both
  registrations is round 4's repair of a self-declaration that was false.** It
  used to say it was "a registered numeric mirror of Table A row A8" and
  "carries no arithmetic result of its own" — both halves wrong by then:

  - **Under Table A, for the FORM.** The lookback must be an *expression over
    `ScanLimits`* and never a result; A8's filler bound is the input, so an
    arithmetic result printed here is a second decider. **This registration has
    existed since round 3 of the parent loop** and it held.
  - **Under Table C, for the FIGURE.** The *floor* — how small a literal may be
    before the corpus notices — is derived from **C3-5's id set**, so any C2 row
    that joins that set can move it. **This registration did not exist**, which
    is precisely why a Table-C-only change (rows 42/43) left the figure stale
    while every Table A check stayed green. That asymmetry is the sharpest
    argument for **Table L**, and it is why the figure now lives there rather
    than in this prose.

  So the paragraph carries **no span, no floor, no lookback value and no id
  set** — all four are Table L's. What it keeps is the *reasoning*: why a
  derivation and not a result, and what holds it. **Round 4 found the previous
  version of this sentence false in its own turn** — it claimed "no span, no
  floor and no id set" while carrying four figures — which is the same defect as
  the declaration it replaced, and is why round 5 reduced the paragraph rather
  than re-writing its self-description a third time.

  **Why V-2e is a whole-line pin, and why its rationale is not in the bash block**

  **This block moved here in round 6, and the move is the repair for a
  structural defect rather than a tidy-up.** It used to be a ~30-line comment
  inside V-2e's ` ```bash ` fence. **V-15's residue sweep excludes those fences**
  — it must, because `SWEEP_EXPECT` lives in one and a sweep reading its own
  expected value cannot converge — so a **registered Table L mirror was living in
  the one region the enforcement structurally cannot reach.** Rounds 4 and 5 both
  ran their figure sweeps over that residue view and were blind to exactly the
  mirror V-15 is blind to: the block carried Table L's shipped value five times
  and a counter-example literal while asserting, in its own words, that it
  "restates no figure from Table L". That is the third recurrence of the
  false-absolute defect, and the second time a sweep certified it clean.
  **This document's own stated remedy is the one applied**: *a review that finds
  prose in a bash block moves it out rather than widening the sweep.*

  **Why the pin is a whole line.** Round 3 measured the previous two-part form
  vacuous in both halves. `grep -q 'ScanLimits.ENTROPY_CTX_FILLER_MAX'` is
  satisfied by the filler-bound interpolation that **every** conforming
  implementation already contains inside `hasBoundContext`'s own regex; and the
  companion "no bare literal" probe was satisfied by writing a *different*
  literal. Measured 2026-07-26: a module carrying such a literal passed both old
  greps. Nothing behavioural can help at the shipped bound either, because there
  the expression and a correct literal compute the same number — the corpus is
  green for every literal at or above **Table L row L1**. A whole-line
  `grep -cxF` is therefore the only structural holder available, and it rejects
  **every** literal, not a listed one.

  **Why the second, "no bare literal" grep is GONE — and what deleting it
  NARROWED (round 6, corrected in round 7, corrected AGAIN in round 8).** Round 6
  called it "structurally redundant", which overstates the case. What the
  whole-line pin rejects is every literal **as the value of that declaration** —
  a second `const CTX_LOOKBACK_MAX` at module scope is a `SyntaxError`, so the
  declaration cannot be both the expression and a number. **It says nothing about
  a literal at the USE site.** Deleting the probe therefore narrowed structural
  coverage to the declaration line, leaving a use-site literal held only
  behaviourally, by C2 row 37 under M-5.

  **Round 7's replacement was a token-line count and it did not close the gap.**
  It asserted `grep -c 'CTX_LOOKBACK_MAX' … -ge 2` — "the identifier must occur
  at least twice". **Executed in round 8** against a from-spec module carrying
  mutation **M-52** (the declaration byte-perfect, the binder slicing with a
  literal), that grep scored **3** and V-2e passed: `grep -c` counts *lines*, and
  a declaration plus any JSDoc line naming the identifier is already two. **A
  count cannot tell a read from a mention.**

  **The root cause was upstream of the count, and that is what round 8 repaired.**
  `hasBoundContext` had **no slice site in "Exact contracts"** — nothing canonical
  for a use-site pin to bind to — so the only available check was a count over the
  whole file. The slice site is now stated there, two lines, and V-2e pins **both
  of them whole** exactly as it pins the declaration: the first carries
  `CTX_LOOKBACK_MAX` at its use site, the second carries A8's same-line clause.
  V-2e also carries a **negative probe** that rewrites the slice to a literal on a
  copy and asserts the pin goes red — so the pin is one somebody has watched fire,
  not a string somebody wrote. Mutation **M-52** is the row it discriminates.

  **What holds the lookback, then.** Two things, and both are needed.
  **(1) Structurally: this pin**, on the exact declaration, at module scope,
  unindented, exactly once, **and on the slice site that reads it**.
  **(2) Behaviourally: C2 row 37 under mutation M-5** —
  Table L rows **L1**, **L3** and **L5** carry every figure involved and this
  section carries none. Read **L4** before concluding that L1's floor is a
  permitted value: it is a corpus fact, not a contract, and the *form* is Table
  A's.

  **Why the registration step is DERIVED from Table H**

  **Round 9 stopped rebuilding this check and extracted its contract instead.**
  Rounds 4 through 8 each produced a blocking finding of one shape — the
  mechanized check was narrower than the absolute beside it — and each round
  answered with a better regex. Round 8's answer was a per-table schema; the
  reviewers broke it in four ways on first contact. **Under ADR-0031 that is the
  point at which the family's bounds are the bug**, so what an id IS, what a
  registration IS and what a duplicate IS now live in **Table H**, byte-identical
  in both legs, and the step reads them at run time.

  **What that buys, stated as the property rather than as a hope.** The step
  holds no second copy of any canonical pattern, so a pattern cannot be changed
  in one place and left behind in the other — the failure mode every previous
  round shipped. What it does NOT buy is completeness: the per-table disposition
  and the dated backlog are still decisions, one line each, and the row for this
  register in "Completeness registers and what actually bounds each" is where
  that residual is stated.

  **The four boundary defects round 9 measured, kept because each is a trap a
  later round could re-dig.** (i) An UNBOUNDED substring test registered `M4` on
  any mention of `M4a`; this leg carried one standalone `M4` against twenty-eight
  masked occurrences, and deleting the standalone one left the round-8 step
  green. (ii) A plain word boundary is not enough either —
  `/\bC3\b/.test("C3-19")` is `true`, so `C3` would be "registered" by any
  mention of `C3-19`. (iii) A `Map` that keeps the first definition reports a
  duplicate as registered, because the first one is. (iv) A criteria list an
  implementer has actually WORKED — the boxes ticked — made every acceptance
  criterion vanish from the enumeration.

  **What the step derives, and where its rationale lives.** It parses **every
  markdown table in this document** and keys each one by its nearest preceding
  heading plus its header. Every table must carry a **schema** entry, and a table
  with none fails, so the schema cannot go short without going red. Each entry
  dispositions its table **`ids`** — the first cells are contract ids that must
  be registered or backlogged — or **`data`** — the rows are corpus or
  measurement values whose registration is the **table**, by a name the step
  asserts is really in the Checklist region **under Table H row H6's boundary
  form**. `ids` tables also assert that every first cell matches that table's own
  pattern, and that **no id is defined twice in any family**.
  **This block is not in the bash fence**, for the reason V-2e's is not:
  V-15's residue sweep excludes fenced ` ```bash ` blocks — it must, because
  `SWEEP_EXPECT` lives in one — so prose written there is in the one region the
  enforcement cannot reach, which **Table J row J5** now states as a shared rule.

  **A known, accepted under-bind.** A8 permits *unbounded* optional whitespace on
  each side of the separator while the slice is fixed-width, so a binding padded
  with many spaces is truncated and does not bind. That fails **safe** (toward
  `redact`, away from the destructive outcome), it requires adversarially shaped
  input to reach, and it is therefore out of scope under ADR-0034's criterion.
  Do not "fix" it by unbounding the slice.

  The input is already byte-bounded by `SCAN_MAX_BYTES` before any rule runs, so
  there is no new ReDoS surface — but keep the predicate's regex to single
  character-class quantifiers, as every other rule in the module does.
- **Do not touch any gate.** Not `src/core/dream/validate.js`, not
  `src/core/digest.js`, not `src/cli/dream.js`, not the EP1/EP3 call sites. Table
  A row A10 is deliberately inert until leg 2 lands: no shipped code in `src/`
  branches on severity, so raising sixteen labelled rules to `quarantine` changes
  no behaviour today and makes leg 2's severity branch safe on the day it lands.
- When uncertain: choose the simpler option and record it under "Decisions made"
  in the PR body. Do NOT expand scope to resolve ambiguity.

### Sizing — this is leg 1 of a two-leg split, and the split line is the reason

`size: M`. The parent spec (`WP-secret-fence-two-tier-entropy`) was one large M
and its round-2 sizing assessment named the fault line precisely: **the Table A /
Table B boundary.** This WP is the Table A side of that line, plus Table C, which
belongs with it because the corpus and the measurements exist to prove the
detector correct.

The parent did not split, and the reason it gave was authorization, not size: the
owner's `OWNER-SIGNED` line sat on the parent file and what it signed included
Table B rows. **The owner authorised the split on 2026-07-26 and accepted the
cost.** The signature stayed with Table B, in the same file, unmoved — that file
is now `docs/specs/WP-secret-fence-ep2-redact-arm.md`. Nothing in this document
was ever covered by it: all three signed items are Table B rows.

### Why leg 2 cannot go first — the ordering prohibition

`WP-secret-fence-ep2-redact-arm` carries `depends_on:
[WP-secret-fence-two-tier-detector]`, and its own verification step V-16 refuses
to proceed unless this WP's changes are already on disk. That machinery exists
because **shipping the gate first is not merely inefficient, it is a
regression.** Both readings of "EP2 first" are bad, and both are recorded so that
nobody re-derives a third:

1. **Table B alone, without Table A row A10.** EP2 starts branching on severity
   while sixteen labelled rules still carry `redact`. Those sixteen rules —
   bearer headers, sensitive `key=value` assignments, JSON values under a
   sensitive key, and the rest — would silently convert from "withhold the note"
   to "scrub the line and commit the note". That is a loosening of ADR-0024's
   ratified behaviour that nothing in this epic intends and no measurement
   supports. A10 exists precisely to prevent it.
2. **Table B dragging A10 along.** Sixteen labelled rules rise to `quarantine`
   and EP2 learns to honour severity — but the entropy pass is still
   context-free and still `quarantine`, so it still fires on the notes M1
   measures, and every one of them still withholds. The user gets the entire
   redact-arm mechanism (a second quarantine directory, a report section, a
   retention cap, a new counter) and **none** of the benefit, because the
   destructive rule is untouched. All cost, no payoff.

The order is therefore fixed: **detector, then gate.** A useful consequence for
the second leg is that this WP's numbers are on `main` by the time it is
implemented, so it can cite a shipped fact rather than restate a measurement.

### Why no dependency on `WP-secret-scan-baseline-oracle`

`depends_on: []` is deliberate. That WP exists to freeze a *before* column so a
successor cannot silently move it — a real problem, and the reason C3-7 exists.
This spec solves the same problem more cheaply: the `today` numbers in the FN
matrix are **constants transcribed from Table C of this reviewed spec into the
test file**, so a wrong "before" is a visible diff against a document on `main`,
not a regenerated fixture. Adding a 1 164-line dependency that changes no
behaviour, and whose corpus was built for rules this WP deletes, would cost a
review round and buy nothing this spec does not already have. That WP is
superseded and filed at `docs/specs/done/WP-secret-scan-baseline-oracle.md` with
`status: Superseded`; its `NEGATIVE` and `POSITIVE` literal rows are salvage for
C2 if anyone wants them. **You do not need to open it** — everything this WP
requires is in Table C.

## Security checklist

- [ ] No untrusted identifier flows into a filesystem path in this WP. The only
      path this WP's code touches is the vault path argument to
      `scripts/measure-secret-fp.js`, which is developer-supplied on the command
      line, is read-only, and is never used by any shipped code path. The script
      is **not** run by `npm test` and is **not** wired into any job.
- [ ] `scripts/measure-secret-fp.js` reads a private vault. It must print
      **counts, rule labels and structural descriptions only** — never a matched
      run, never a line of vault prose, never a filename outside the vault-
      relative form. Its output is pasted into a PR body; treat every byte of it
      as public. The FP frequency list in M2 is the maximum detail permitted, and
      those entries are path fragments the maintainer cleared for publication.
- [ ] `tests/fixtures/secret-corpus.js` contains **no real credential and no
      verbatim sentence from any private vault** (Table C1 is generator-only by
      construction; Table C2's rows are sanitized reproductions). Do not "improve"
      a fixture by pasting a real token you found somewhere.
- [ ] `hasBoundContext` never crosses a newline and never scans backwards past
      `SCAN_MAX_BYTES`-bounded input; keep its regex to single character-class
      quantifiers so it adds no ReDoS surface (see Implementation notes).

## Accepted residuals (stated, not buried)

1. **A credential whose entropy-visible tail is drawn from an alphabet
   containing `/`, pasted with no bound sensitive keyword, is caught less often
   than today.** This is the WP's one deliberate false-negative trade, and it is
   **larger than the parent spec's first revision claimed**: it is not one class
   in two contexts but **the fixtures marked `/`? = yes in Table C1 that are also
   `labelled? = no`, less `slack-webhook-url`, in `bare`, `prose` and `table`
   context**. The exact
   before/after rate and the CI floor for each is **Table C3 row C3-3**, which is
   the only place they are written. In `assign` context nothing regresses.

   Accepted, for three reasons that hold for every member of the set. (i) The
   shapes these credentials actually arrive in — `aws_secret_access_key=…`,
   `AWS_SECRET_ACCESS_KEY=…`, `secret: …`, a `.env` line, a YAML value, a Go
   `apiKey := "…"`, a PHP or Ruby `'secret_key' => '…'`, a Make `API_KEY ?= …` —
   bind tier 2 or match a labelled rule and stay at 100%, at `quarantine`
   severity; the exposure is specifically the *bare paste with no nearby
   keyword*. **This claim is only true because A8a's separator set is a token
   set**: under the one-character rule an earlier revision specified, the last
   three of those shapes bound nothing and fell to `redact` or to no finding at
   all (M4c). If A8a shrinks, this reason goes with it.
   (ii) gitleaks itself catches `aws-secret-access-key` only through keyword
   context and has no rule for the class, so this is parity with the reference
   implementation rather than a Wienerdog-specific gap. (iii) The loss scales as
   1/length and the corpus pins each format at its published *minimum*, so C3-3's
   floors are the worst case, not the typical one.

   **What is given up in exchange is measured and larger**: M1's withhold count
   on a real vault, versus a single-digit percentage on synthetic draws of six
   formats. That is the trade ADR-0034 ratified.
2. **Most C1 formats have no labelled rule** and are caught by the entropy pass
   alone. The exact set is Table C1's **`labelled?` column** — read it there;
   this bullet deliberately does not restate a count, because an earlier revision
   said "fifteen" while the table implied a different number and the two drifted
   apart. `gitlab-pat` is caught 0% bare, today and after this WP. **This is
   pre-existing and unchanged by this WP** — C3-2 asserts the regression set is
   exactly C3-3's — but it is the strongest argument for a follow-on WP that adds
   the missing prefixes, which is cheap and purely additive. **That follow-on
   should start with the slash-bearing prefixes** — `glc_` (Grafana) and
   `sc_`/`ext_`/`scauth_`/`authress_` (Authress) — because a labelled prefix rule
   there restores exactly the coverage residual 1 gives up, at no FP cost.
3. **A small set of benign runs still produces a finding, and in the interim
   still costs the user a revert.** The exact set is **Table C3 row C3-6**, by C2
   row id. Two of them are prose identifiers and two are **opaque random tokens**
   — measured on the real vault, the redacted class is 4 distinct runs over 12
   occurrences, and half of them are not prose-shaped at all, which an earlier
   revision got wrong. C2 rows 25 and 27 are the sanitized reproductions of that
   sub-class. **Not every id in C3-6 is one of these**: rows 33, 34, 35, 37,
   39, 40 and 41 are *negative controls* — deliberately shaped probes that hold
   A8a's excluded separators and five clauses of A8 (its filler bound, its
   lookback derivation, its candidate-adjacency requirement, its separator
   cardinality and its quote/backtick cardinality) — not measured
   false-positive classes. Read C3-6 as "the rows that must land at `redact`",
   and each row's own C2 cell for why it is there.

   **What this leg does and does not do about them.** It takes their severity
   from `quarantine` to `redact` (A6). It does **not** change what EP2 does with
   a `redact` finding — EP2 still keys on `findings.length > 0`, so in the
   interim these notes are still withheld and reverted, exactly as today, and
   are still recoverable from `state/quarantine/`. Converting that outcome into a
   recoverable in-place scrub is the whole job of
   `WP-secret-fence-ep2-redact-arm`. Until that leg lands, the honest statement
   is: **the severity is right and the disposition is still conservative.**
4. **C3-2 measures catch *rate* and is blind to severity, so a severity-only
   change never shows up in the FN matrix.** Every C1 fixture without a labelled
   rule moves `quarantine → redact` in `bare`/`prose`/`table` under A6, by
   design, and the matrix cannot see it. Permitted by ADR-0034 Decision 6, which
   puts context-free high-entropy at `redact`.

   **This is stated as a residual because it once hid a real hole.** An earlier
   revision of this list claimed `Authorization: Basic <base64>` merely "drops
   from `quarantine` to `redact`" and was "still scrubbed by `redactOnly` at EP1
   and EP3". Measured, that was false: the credential produced **no finding at
   all** 10–31% of the time depending on body length, so `redactOnly` did not
   scrub it and EP2 did not withhold it (M4d). It is a named, published format
   (gitleaks' `curl-auth-header`), so under ADR-0034's criterion it was a
   class-(a) finding, not a residual. **Table A row A16 closes it** with a
   labelled rule, and `authorization-basic` is now a C1 fixture at 100%
   `quarantine` in all four contexts (C3-4). The general blindness above
   remains; the specific hole does not.
5. **Prose that *describes* an alphabet still quarantines.** The exact
   reproduction is **C2 row 32** — a `<KEYWORD>_CHARS = '<alphabet>'` constant,
   where the keyword sits inside the identifier, the filler is the rest of the
   identifier, the separator is the `=`, and the value is a long, maximal-entropy
   base64 alphabet. This is a `quarantine`, i.e. the destructive outcome, on
   ordinary technical documentation, and it is stated here rather than buried
   because C3-5 would otherwise read as "no C2 row withholds" while the corpus
   contradicted it.

   Accepted, for four reasons. (i) **It is not a regression** — the shipped
   detector quarantines the same line, so nothing gets worse. (ii) **Measured
   frequency**: M4a measures it once across this repository's own `docs/` tree,
   and M1 measures it zero times in the maintainer's vault. (iii) **It is structurally
   indistinguishable from a real credential assignment.** `api_token_v2 =
   '<64 base64 characters>'` is the same shape; the only thing separating them is
   that one value happens to be a sorted, complete alphabet — and a rule keyed on
   that is a suppressor keyed on the candidate's own characters, which **ADR-0034
   Decision 7 bans permanently, in every form**. (iv) **The path-shaped class
   goes to zero ON THE MEASURED CORPORA, which is a narrower claim than the one
   this item used to make and the narrowing is round 1 of the design gate's.**
   The previous wording was "the class this WP exists to kill, the path-shaped
   run, still goes to zero". What is true, and all that is true: C3-5 forbids any
   withhold among C2 rows **1–28**; M5 measures the one remaining withhold on the
   real vault as a labelled-rule hit; and M4a/M4f measure one `quarantine` line
   across this repository's `docs/` tree, which is row 32's shape. **What is NOT
   true is that no path-shaped run can reach `quarantine` under A8** — residual 6
   is the counterexample, it is reproduced as C2 rows 42 and 43, and it was
   missing from this list until the design gate found it.
6. **A sensitive keyword carrying a word-character metadata suffix still binds,
   so a path-shaped run and a compact 32-hex UUID still quarantine.**
   Reproduced as **C2 rows 42 and 43** — `credential_path: <path>` and
   `token_id: <32 hex>`. A8's filler class `[ \t\w.-]` contains `_`, so `_path`
   and `_id` are ordinary filler and the keyword reaches the separator. Measured
   2026-07-27 against a from-spec prototype: both reach `quarantine`, i.e. the
   destructive outcome, on strings a real system emits.

   **Accepted, for four reasons, and the third is the one that decided it.**
   (i) **Neither is a regression.** The shipped context-free entropy pass
   quarantines both today — 34 characters at 4.021 bits and 32 at 3.679, each
   over the shipped floors — so nothing gets worse; what this WP fails to do is
   *fix* them. Under ADR-0034's review criterion that makes this class (b), a
   false-positive class, not class (a).
   (ii) **Measured frequency is zero on both corpora.** M4's separator-bound
   predicate quarantines **0** of the 182 vault notes at every filler setting,
   and a grep for `(credential|token|secret|password|api[_-]?key)s?_(path|id|dir|file|name|url)` followed by
   `:` or `=` over `src/`, `docs/` (excluding `docs/specs/`), `skills/` and
   `templates/` returns **0 lines**, executed 2026-07-27. So M5's figures are
   unaffected and are **not** restated or re-derived here.
   (iii) **The obvious narrowing was built and measured, and it is LEAKY — that
   is why it was rejected rather than merely declined.** The candidate repair is
   a negative lookahead stopping a keyword from binding when a metadata suffix
   follows it. Measured 2026-07-27: it moves **0 of the 41 pre-existing C2 rows**
   and it does fix `credential_path:` (→ `clean`) and `token_id:` (→ `redact`).
   **But `SENSITIVE_KEYS` carries optional-plural forms (`credentials?`) and
   short keywords that are prefixes of longer words, so the alternation
   backtracks straight past the lookahead**: `credentials_path:`, `secrets_path:`,
   `passwords_path:` and `tokens_id:` all still reach `quarantine`, because the
   engine matches the singular keyword and lets the plural `s` become filler.
   The narrowing would therefore suppress exactly one spelling of the class and
   leave the rest — **a partial suppression that reads like a closure**, which is
   worse than an honest residual, because the next round would find the class
   listed as fixed. Making it robust means word-boundary-aware keyword matching,
   which changes A7's "reuse the shipped constant; do not write a second list"
   instruction and the shipped `SENSITIVE_KEYS` semantics — out of scope for this
   WP and a change no measurement on either corpus asks for.
   (iv) **A suppressor here would also be pointed the wrong way.** It keys on the
   *keyword's* characters rather than the candidate's, so it is not what ADR-0034
   Decision 7 bans — but it buys zero measured false positives back and costs
   real coverage on shapes a credential does arrive in: measured, the same
   narrowing drops `api_key_id: <40 base64>` and `token_name: <40 base64>` from
   `quarantine` to `redact`.

   **What is given up, stated plainly:** two named shapes still cost the user a
   revert in the interim and a withhold after leg 2, and this WP does not fix
   them. **A follow-on that makes the keyword match word-bounded would fix the
   class properly**, and rows 42/43 are the corpus rows it would flip; that is
   the right home for it, not this WP.

## Acceptance criteria

Criterion ids are inherited from the parent spec `WP-secret-fence-two-tier-entropy`
so that a reader can trace a criterion across the split. The gaps (AC-7 … AC-10,
AC-14, AC-19) are the EP2-gate leg's and are not missing here. **That tracing
only works while an id means the same check in both legs**, which is what the id
convention under "Verification steps" states and what round 4's renumbering of
the mutation and verification tables restored; no AC id was found to have
diverged, so none moved.

- [ ] **AC-1** `ENTROPY_CORE_CLASS` and `ENTROPY_WIDE_EXTRA` are the only
      character-class literals in the entropy pass; both regexes are built from
      them (Table A, A1).
- [ ] **AC-2** For **every printable-ASCII character in C3-1's range** — that row
      decides the range and both literals, and this criterion restates neither —
      the accepted set of each tier equals the **hand-written literal** for that
      tier in C3-1, observed through `scanAndRedact` by C3-1's `A + c + A` probe. The relative
      facts (the two sets differ in exactly one character, and it is `/`) are
      asserted **in addition**, never instead: a mutation that corrupts both
      tiers identically satisfies the relative form and must fail here (M-34).
- [ ] **AC-3** A tier-2 candidate at or above the floor **with** bound context
      yields one `high-entropy` finding at `quarantine` (A5).
- [ ] **AC-4** The same candidate **without** bound context yields `high-entropy`
      findings at `redact` for each qualifying tier-1 sub-run, and none at
      `quarantine` (A6). A low-entropy wide run containing a high-entropy narrow
      sub-run still yields the `redact` finding.
- [ ] **AC-5** **Every** labelled rule emits `quarantine` — the set and its size
      are Table A row A10's to decide and are not restated here; `severityForKey`
      and `QUARANTINE_KEYS` no longer exist (A10, A11).
- [ ] **AC-21** The `basic-auth` rule exists and behaves as A16 says. In `bare`,
      `prose` and `table` context, `Authorization: Basic <base64>` yields exactly
      one finding — `basic-auth` at `quarantine` — and the body is replaced by
      `[REDACTED:basic-auth]` while the literal `Authorization: Basic` survives.
      **In `assign` context it does not, and that is expected**: the wrapper is
      `secret=Authorization: Basic <b64>`, and the shipped legacy assignment rule
      runs first (rule order is byte-compatibility, not a choice) and consumes
      `secret=Authorization`, so `basic-auth` never sees the input. **The
      `quarantine` finding there is `generic-secret`; a tier-1 `redact` on the
      residual body may accompany it.** Measured 2026-07-26 against a from-spec
      prototype, `assign` yields **two** findings — `[{generic-secret,
      quarantine}, {high-entropy, redact}]` — because the legacy rule replaces
      only up to the `:` and leaves `Basic <b64>` behind for the entropy pass.
      **Do not assert `findings.length === 1` here**: an earlier revision said
      "the finding there is `generic-secret`", and that reading goes red. Assert
      the `quarantine` finding's label and severity, not the array length. Do not
      "fix" the rule order either — the fixture is still 100% `quarantine` in all four contexts,
      which is exactly what C3-4 claims. Also: `Authorization: Bearer <token>`
      still produces `bearer-token` and never `basic-auth`; and
      `authorization-basic` is in C3-4's id set.
- [ ] **AC-6** `src/core/secret-scan.js` contains exactly one `add(…,
      SEVERITY.REDACT)` producer (A13, C3-8).
- [ ] **AC-11** Corpus sizes match C3-0, and the FN matrix satisfies C3-2: the
      regressing set is asserted as an **equality** on the (fixture, context)
      pairs of C3-3, and every one meets its C3-3 floor.
- [ ] **AC-12** The labelled-rule fixture set is exactly C3-4's id set, each
      caught 100% at `quarantine` across all four contexts.
- [ ] **AC-13** C2 corpus: the `quarantine` row set is **exactly** C3-5's id set
      and the `redact` row set is **exactly** C3-6's id set — both asserted as
      equalities on ids, so a detector that fires on nothing fails and so does one
      that binds no separator.
- [ ] **AC-15** Every mutation in the Mutation checks table makes at least one
      named test fail. **No row is exempt and no row may carry a licence to stay
      green** — round 3 found two that did (M-5 named a row that does not move,
      M-13 pre-authorised its own no-op in writing), and either would have left
      an implementer with an unsatisfiable instruction or an untested contract.
      A mutation whose suite stays green is a spec bug: stop and say so.
- [ ] **AC-16** `npm test` and `npm run lint` pass.
- [ ] **AC-17** The EP1/EP3/EP4 loosening is asserted, not assumed (A14).
      `redactOnly('see Projects/wienerdog/current for detail')` returns its input
      **byte-unchanged**, against `'see [REDACTED:high-entropy] for detail'`
      today, and `scanAndRedact` on that string returns `findings.length === 0`,
      against `1` today. No file under EP1, EP3 or EP4 is edited.
- [ ] **AC-18** Severity escalation (A15, C3-9): a mixed note yields one
      `high-entropy` finding at `quarantine`, and `hasHardFinding` is `true`, **in
      both line orders**.
- [ ] **AC-20 (the interim contract — this leg changes no gate).** None of
      `src/core/dream/validate.js`, `src/core/digest.js`, `src/cli/dream.js`,
      `src/cli/sync.js`, `src/core/transcripts/index.js`, `src/core/alerts.js`,
      `src/core/dream/brain.js`, `src/cli/run-job.js` or
      `src/core/run-evidence.js` appears in the diff (V-14). EP2 therefore still
      keys on `findings.length > 0` and still withholds and reverts a note with
      **any** finding of **either** severity, and `secretReverts` keeps both its
      meaning and its transcript-deferral consequence.
      **`tests/unit/dream-validate.test.js` and `tests/unit/digest.test.js` pass
      unmodified** — they are not in the Deliverables table, and if either needs
      an edit to go green, that is a spec bug: say so in the PR and stop.

### Mutation checks (run these; a green suite against unmodified `src/` is not evidence)

Mutation ids follow the **id convention** stated under "Verification steps".
M-1 … M-6, M-13, M-14 and M-15 are inherited from the parent spec and mean the
same check in both legs; the gaps (M-7 … M-12, M-16, M-17) mutate
`src/core/dream/validate.js` and belong to the EP2-gate leg. **M-34 … M-44 are
leg-1-only ids in the range the orchestrator issued on 2026-07-26** — round 4
measured that M-18 … M-24 each named a *different* check in each leg, moved leg
1's seven down the file, and collided again on two of them; round 5 moved those
two once more, from an allocation read across both documents rather than derived
inside this one; **round 6 moved two more — one of them allocated in round 4 and
one of them round 5's own repair — because the range round 5 was issued had been
measured before the sibling's concurrent round-5 pass landed.** **One further
number, between M-17 and M-34, is vacated in this leg rather than being a
split-time gap** — item 4 of the id convention names it and forbids re-using it,
and this preamble deliberately does not restate it. **`M-52` sits outside that
range and is round 7's, allocated singly**; round 7 stated it as an allocation
figure two paragraphs into the id convention as well, and round 8 removed that
statement because it was wrong — the same commit defined this row. See the id
convention under "Verification steps" for why this document may not assert
anything about the sibling's numbers, and for why the allocation is now a
**procedure that is run** rather than any kind of figure, dated or not.

| # | One-line mutation to `src/` | Must fail |
|---|------------------------------|-----------|
| M-1 | change `ENTROPY_WIDE_EXTRA` to `''` | **AC-2 and AC-13.** **AC-2** is the criterion this row exists for (C3-1's iff no longer holds — the tiers become identical). C3-1 is the only thing standing between this WP and a silent collapse of the two-tier design, which is why AC-2 is asserted over C3-1's whole printable-ASCII range rather than by sampling. **AC-13 fails too, and an earlier revision's "AC-2 only" was wrong about it — measured 2026-07-27, round 1 of the design gate**: C2 row **42**'s candidate is the path-shaped `Projects/example/wienerdog/current`, held together as one 34-character run *by the slash*. Remove `/` from the wide class and it fragments into `Projects` (8), `example` (7), `wienerdog` (9) and `current` (7), every one under the 24 floor, so the row falls from `quarantine` to **clean**, C3-5's id set loses 42 and its equality fails. **No other C2 row moves** — 42 is the only one whose run depends on a slash to clear the floor. This is a strengthening the corpus acquired when rows 42/43 were added, not a change to the mutation. Deliberately *still not* AC-11: with the two tiers collapsed, every `/`-bearing C1 fixture is still caught in `assign` at 100% by the labelled assignment rules and its `bare`/`prose`/`table` rate is unchanged, so the FN matrix cannot see this mutation (verified 2026-07-26) |
| M-2 | add `/` to `ENTROPY_CORE_CLASS` | AC-2, AC-13 (C2 rows 1–13 quarantine or redact — **except row 2, which does not move**: with `/` in the core class its longest run is `brain/tooling`, 13 characters, still under the floor, so it stays clean. Measured 2026-07-26. The row is a legitimate corpus entry, not a hole; it just cannot see this mutation) |
| M-3 | make tier 1 require context too | AC-4, AC-13 (C3-6's rows go clean → the ceiling must be an equality on ids, not an upper bound) |
| M-4 | make tier 2 fire without context | AC-13 (C2 rows 10–13 quarantine) |
| M-5 | raise `ENTROPY_CTX_FILLER_MAX` to 40 | AC-13 via C3-12: C2 rows **35 and 37** must **both** move to `quarantine`, and no other row in **35–41/44** may move. **Read which rows moved, not just the exit status.** Row 35 alone moving is a failure of C3-12: it means `hasBoundContext`'s lookback is a literal rather than the derived expression, because row 37's binding span (**Table L**) exceeds the shipped-bound value and a lookback frozen there truncates it (see Implementation notes, "Why the derivation and not the arithmetic result"). An earlier revision named **row 13**, which does not move: measured, raising the bound to 40 changes **no** row in 1–34 at all, because row 13's candidate is preceded (modulo whitespace) by the `t` of `not` and has no adjacent separator — A8's filler sits between the keyword and the separator, never between the separator and the candidate (the clause row 39 now holds). M-5 was therefore unachievable and would have halted the implementer |
| M-6 | revert one labelled rule to `SEVERITY.REDACT` | AC-5, AC-6, AC-12 |
| M-13 | widen A8's filler class from `[ \t\w.-]` to `[^\n]` | AC-13 via C3-13: C2 row **36** must move to `quarantine` and no other row in **35–41/44** may move. **The earlier "if the suite stays green, say so in the PR" licence is withdrawn** — it was true when written (measured: widening the class moved no C2 row) but a mutation row that permits its own no-op contradicts AC-15 and leaves half of A8 untested. Row 36 closes the gap; a green suite here is now a defect, not a note for the PR body |
| M-14 | **add** the vertical bar to `SEP` (Table A row A8a) | AC-13 via C3-10: C2 rows **26 and 27** must move to `quarantine` and row **28 must stay clean**. This is the mutation that guards the M4a decision — the direction is *add*, not drop, because the bar is not in `SEP` |
| M-15 | remove the escalation branch from `add`, leaving `existing.count += 1` alone | AC-18 (C3-9's reversed line order returns `redact` and `hasHardFinding` false) |
| M-34 | drop `+` and `=` from `ENTROPY_CORE_CLASS`, leaving `'A-Za-z0-9'` | **AC-2 and AC-13.** **AC-2** is the criterion this row exists for: both tiers shrink *identically*, so C3-1's *relative* iff still holds and its one-character difference is still `/`; only the hand-written absolute literals catch it. Verified 2026-07-26 against a from-spec prototype: relative form passes, absolute form fails. If AC-2 stays green here, the test is asserting the tiers against each other instead of against a literal — that is the defect, not a passing build. **AC-13 fails too, and an earlier revision's "AC-2 only" was wrong about it** (measured, round 5): C2 row 20 is `see Documentation=RepositoryConfiguration end`, whose single 37-character tier-1 run is held together by the `=`. Drop `=` from the class and it splits into `Documentation` (13) and `RepositoryConfiguration` (23) — both under the 24 floor — so the row falls from `redact` to **clean**, C3-6's id set loses 20, and its equality fails. No other C2 row moves: 20 is the only one whose run depends on a `+` or an `=`. Whether the C3-3 floors also move was **not** measured and this row does not rest on it |
| M-35 | delete the A16 `basic-auth` rule | AC-21, AC-12 (C3-4's id set loses `authorization-basic`), AC-11 (C3-2's regressing set gains three `authorization-basic` cells that are not in C3-3, so the equality fails) |
| M-36 | let `hasBoundContext` cross a newline — take the slice from `idx - CTX_LOOKBACK_MAX` without stopping at the preceding `\n`, i.e. the `\s*` form | AC-13 via C3-14: C2 row **38** must move from `clean` to `quarantine`, and no other row in **35–41/44** may move. Holds A8's same-line clause, which A8 states, `hasBoundContext`'s JSDoc repeats, and nothing held before round 3. The mutation is in the *loosening* direction because same-line-only is the conservative reading |
| M-37 | allow filler between the separator and the candidate — insert a second `[ \t\w.-]{0,ENTROPY_CTX_FILLER_MAX}` after the separator in `hasBoundContext`'s regex | AC-13 via C3-15: C2 row **39** must move from `redact` to `quarantine`, and no other row in **35–41/44** may move. Holds A8's adjacency requirement, which M-5's own note leans on to explain why raising the bound moves no row in 1–28 |
| M-38 | quantify the separator — write `(?:${SEP})+` instead of `(?:${SEP})` at `hasBoundContext`'s use site, leaving the `SEP` declaration byte-identical | AC-13 via C3-16: C2 row **40** must move from `redact` to `quarantine`, and no other row in **35–41/44** may move. Holds A8's separator **cardinality**. **This mutation is invisible to every grep in this document** — measured 2026-07-26, a module carrying it passes V-2, V-2e and both of V-12's pins — and it was invisible to the corpus too until row 40 existed. It is also the one A8-clause loosening with a measured false positive on real prose (M4f) |
| M-39 | quantify **both** quote/backtick slots — write `*` instead of `?` on both `["'\`]` groups in `hasBoundContext`'s regex | AC-13 via C3-17: C2 rows **41 and 44** must **both** move from `redact` to `quarantine`, and no other row in **35–41/44** may move. **Read which rows moved, not just the exit status** — row 41 alone moving means the pre-separator slot was left at `?`, which is a *different* implementation from the one this row mutates and is what M-44 isolates. Holds A8's quote/backtick **cardinality** as one whole clause. Same invisibility as M-38 to every grep and to all 39 pre-round-4 rows; unlike M-38 its measured `docs/` cost is zero lines (M4f). *Re-measured 2026-07-27 over all forty-four rows; the previous cell named row 41 alone, which was correct only while row 44 did not exist* |
| M-52 | **the DEAD DECLARATION** — keep `const CTX_LOOKBACK_MAX = 21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 12;` exactly as V-2e pins it, and have `hasBoundContext` slice with a literal instead of reading it | **V-2e's SLICE-SITE pin** — the whole-line pin on `const back = text.slice(Math.max(0, idx - CTX_LOOKBACK_MAX), idx);`, which the mutation must rewrite — and **AC-13 via C3-12** behaviourally, because under **M-5** the literal truncates row 37's binding and only row 35 moves. **This mutation is what makes the declaration pin and the use-site pin distinguishable**: the declaration pin alone passes against it, since that line is byte-perfect and merely unused. *Round 6 deleted a probe on the grounds that the line pin "rejects every literal"; it rejects every literal AS THE VALUE OF THAT DECLARATION, which is a narrower claim, and this row is the gap it left. **Round 7's replacement — `grep -c 'CTX_LOOKBACK_MAX' … -ge 2` — did not close it either**: executed in round 8 against a from-spec module carrying this mutation, it scored **3** and passed, because a JSDoc line naming the identifier is a line. Round 8 replaced the count with the slice-site pin and added V-2e's own negative probe, which fires on this mutation.* |
| M-44 | quantify the **PRE-separator** quote/backtick slot **alone** — write `*` instead of `?` on the **first** of the two quote/backtick groups in `hasBoundContext`'s regex (the one that sits before the separator, i.e. the first of the pair M-39 quantifies together) and leave the second at `?` | AC-13 via C3-19: C2 row **44** must move from `redact` to `quarantine`, and **no other row moves at all**, row 41 included. Holds A8's pre-separator quote slot, which **round 5 recorded as unheld anywhere** and round 1 of the design gate closed. **This is the mutation that makes 41 and 44 a pair rather than a duplicate**: without it, an implementation with `*` before the separator and the required `?` after it passes row 41, passes M-39's observed outcome and passes every structural grep while violating canonical A8 — which is the contradiction of AC-15 Codex's round-1 review named. **Invisible to every grep in this document**, exactly like M-38 and M-39: the `SEP` declaration and the lookback line are byte-identical under it, so V-2, V-2e and both of V-12's pins stay green. **New id**, allocated under the id convention's measured-enumeration carve-out. **The next-free figure is NOT restated here** — it is decided once, in the id-convention section under "Verification steps", and this cell's own copy went stale the moment the sibling took M-45 … M-48 in the same pass. *Round 3 of the design gate: cite-not-restate, applied to an allocation figure for the same reason it applies to a corpus count.* |
| M-40 | replace `SEP` with the bare character class `[:=>]`, i.e. **drop** `:{1,3}=`, `=>` and `?=` | AC-13 via C3-11: C2 rows **29, 30, 31** fall from `quarantine` to `redact`. This is the mutation in the *dropping* direction, and it is what makes A8a's adoptions testable — without it a future edit could quietly restore the one-character rule M4c measured as a cliff |
| M-41 | **add** `,` to `SEP` | AC-13 (C2 row 33 moves to `quarantine`) |
| M-42 | make `hasBoundContext`'s keyword match **case-sensitive** — drop the `i` flag, or lower-case the haystack nowhere | **AC-13 via C3-5**: C2 rows **29, 31 and 32** fall from `quarantine` to `redact`, so C3-5's id set loses three members and its equality fails — **read the set in C3-5, which is the only place it is written, and do not reproduce the survivors here either**; round 3 found this cell naming three of the six, which is the same restatement one clause further on; C3-6 gains the three and fails too. Row **30 does not move** — its keyword is the already-lower-case `secret` inside `secret_key` — which is what makes this mutation discriminate the *casing* rather than the keyword list. Holds A8's case-insensitivity clause, which the shipped `SENSITIVE_KEYS` constant and every rule that consumes it already assume (`SENSITIVE_KEYS` is spelled entirely in lower case; `secret-scan.js`'s own `labelForKey` normalises with `.toLowerCase()`), and which A8 did not state until round 5. Unlike M-5, M-13 and M-36 … M-39 this one is held by the **main suite**, not by a 35–41/44 negative control, so no new C2 row is needed |
| M-43 | **add** `\|\|` to `SEP` | AC-13 (C2 row 34 moves to `quarantine`). **Renumbered in round 6** out of a cross-leg id collision — same mutation, same check, new number; the reallocation map under "Verification steps" carries the chain |

M-3 is why C3-6 is an **equality on ids** rather than an upper bound: a rule that
fires on nothing also satisfies "at most N". M-14 and M-40 are why C3-10 and
C3-11 exist: without a mutation in the *adding* direction and one in the
*dropping* direction, A8a would be documentation with no test behind it. M-34 is
why C3-1 is absolute rather than relative. M-5, M-13, M-36, M-37, M-38, M-39 and
**M-44** are the seven clauses of A8 that only a 35–41/44 negative control can
see, one mutation each — **except that M-39 and M-44 mutate one clause at two
granularities**, the whole clause and its pre-separator half, which is why M-39
moves two rows and M-44 moves one. **M-42 and the optional-whitespace clause are
held by the main suite instead**, through C3-5, which is why neither needs a
corpus row; the whitespace clause has no mutation row at all, and M4e's row for
it says so in words rather than leaving the gap to be found. M4e is the register
of all of this — a register **V-29** re-digests whenever either side is edited,
because "a clause of A8 with no mutation row" was the round-3 defect found twice,
the round-4 defect found twice more, the round-5 defect found twice again, and
round 1 of the design gate's finding once more (the optional whitespace, which
A8 states twice and the register named nowhere).

## Verification steps (run these; paste output in the PR)

**Run this block as a script, not by pasting lines.** The first line is
`set -euo pipefail` and it is load-bearing: without it a failing `test` or `grep`
prints nothing and the block continues, so "exit status carries the verdict"
would be false. Round 2 found three steps in this block that exited 0 on
violation, 1 on success, or both.

**Round 3 found the repair for those three was itself broken, and this is worth
reading before you edit anything here.** Round 2 rewrote every negative check as
`! cmd`. **`set -e` does not abort on `! cmd`** — POSIX and bash both suppress
errexit when a command's return status is inverted with `!` (bash manual, `set
-e`: "…or if the command's return status is being inverted with `!`"). Measured
2026-07-26: a script consisting of `set -euo pipefail` followed by a `! grep`
whose grep *succeeded* — i.e. the violation was present — printed nothing,
continued to the end, and **exited 0**. Every `! cmd` in this block was therefore
a comment with a shebang. `shellcheck` says so too, as SC2251.

**Every negative check below is now an explicit `if … then … exit 1; fi`**, via
the `must_not` helper for simple commands and inline for pipelines. Never write a
negative check as `! cmd`, and never as `cmd && exit 1` (which round 2 correctly
rejected: under `set -e` a failing `cmd` in that form takes the whole block
down for the wrong reason).

**The id convention, stated once here and binding on both id tables.** An id
means **one** check across this epic, or it belongs to **one** leg.

**Read this clause first, because rounds 4 and 5 each shipped a collision while
believing they had not, by two different routes.** Under the One-Document Rule
(ADR-0005) no agent working inside either leg may open the other leg's spec — so
**no agent inside a leg can verify a cross-leg id allocation**, and any claim
this document makes about the sibling's ids is an assertion nothing here can
check. Round 4 derived its own range and wrote that it had moved into "a range no
other leg uses" and that "the other leg's ids keep their meanings and their
numbers"; measured across both files, three of the seven reallocated ids collided
again. Round 5 replaced that with a range **supplied by the orchestrator**, the
only party that reads both documents — and **two of the ids it issued collided
anyway.** The range had been measured *before* the sibling's own concurrent
round-5 pass landed, so it was already stale when it was handed over: the failure
this convention exists to prevent, committed by the party the convention names as
authoritative. Round 6 moved those two — **M-33 → M-43 and V-28 → V-29** — and
added the second bullet below, which is the actual lesson. The convention is
therefore:

- **Leg-local ids are allocated by RUNNING THE ALLOCATION PROCEDURE BELOW**, with
  both leg files final and no agent writing to either — the state only the
  orchestrator or the architect can hold. *Rounds 5 and 6 wrote this bullet as "a
  range SUPPLIED BY THE ORCHESTRATOR … a leg asks for a range; it does not derive
  one", and a supplied range collided twice. Round 7 replaced the range with a
  command that had none of the three properties it needed, and round 8 replaced
  the command. **A leg does not ask for a range and does not derive one: it runs
  a procedure at the instant it writes.***
- **AN ALLOCATION IS VALID ONLY AT THE INSTANT IT IS RUN.** It is a measurement,
  not a reservation — nothing prevents the other leg from taking a number a
  second later, and nothing in either file records that it did. **Any allocation
  taken while either leg may be under edit must be RE-RUN AT WRITE TIME.** A
  figure quoted from an earlier round, or from a reading taken before a sibling
  pass landed, is evidence of nothing. That is precisely what round 5 skipped and
  round 6 paid for, twice — **and round 7 paid for a third time by writing the
  reading down at all.**
- **This spec may state its own ids and the date the allocation was checked. It
  may NOT assert what the other leg uses, or that a range is free — EXCEPT under
  the carve-out below.** Not "a range no other leg uses", not "the sibling's ids
  are unaffected", not an undated list of the sibling's numbers. **Item 4 below
  was brought into line with it in round 6** — it had carried a tail asserting
  whose the vacated numbers now are, which is unverifiable from inside this leg;
  item 3 keeps its statement about the *split*, which is traceable here, and
  says why the two differ.
- **THE CARVE-OUT, added in round 2 of the design gate because BOTH legs were
  relying on it while the rule forbade it.** The prohibition above is about
  *unverifiable* claims — an agent inside one leg cannot see the sibling, so any
  assertion it makes about the sibling's numbers is a guess. **That is not the
  only way such a statement can be produced.** When a party holding BOTH FILES
  FINAL, with no agent writing to either, enumerates the ids in both and records
  the reading, the statement is a **measurement** and it is exactly as
  trustworthy as the "re-measure at write time" bullet above demands. So:

  > A cross-leg id statement is permitted **iff** it is (i) taken by a party
  > holding both files final, (ii) **dated**, and (iii) stated as a
  > **measurement, never a reservation**. It is valid at the instant it was
  > taken and at no later instant.

  **What the carve-out is now FOR, and it is narrower than round 2 needed it to
  be.** Round 2 admitted the carve-out because each leg's "next free" figure was
  *derived from* a reading of the sibling, so deleting the reading would have
  left the figure unexplained. **Round 8 deleted the figures instead** — the
  procedure above is the derivation, it is executable, and it reads both files
  itself. So no statement in this leg needs to assert what the sibling holds. The
  carve-out survives for one narrower job: it is what licenses the **procedure**
  to read both files and to fail on a cross-leg collision, and it is what would
  license a future *dated measurement* if one were ever wanted. **What is still
  forbidden is the undated, unmeasured form**, which is what the rule was written
  against — and, as of round 8, the dated form is no longer used either, because
  round 7's dated snapshot was wrong on the day it was dated. Round 2 also
  deleted a sentence here claiming "the sibling declines to claim anything about
  leg 1's ids": the sibling no longer declines, and a rule that describes the
  other document's behaviour is a cross-leg assertion of exactly the kind this
  bullet forbids.
- A reviewer who wants the allocation re-checked **runs the procedure below** and
  pastes its output. It reports both prefixes, both legs' definitions and any
  cross-leg collision, so the answer is the same one the architect would get and
  needs no request at all.

**The durable fix is LEG-TAGGED IDS, and it is recorded here as a follow-up
candidate rather than done in this pass.** Prefixing each leg's local ids with a
leg letter — `D-M-nn` / `D-V-nn` for this leg, the detector, and `G-M-nn` /
`G-V-nn` for the EP2-gate leg — makes a cross-leg collision **structurally
impossible instead of procedurally avoided**, and takes the orchestrator's
point-in-time measurement off the critical path entirely, which is the only thing
that would have prevented both failures. It is not done here for a stated reason,
not an omission: renaming every id across both documents at freeze time touches
every mirror, every verification comment and both files' accumulated review
history, and would leave a reader tracing a round-4 or round-5 comment landing on
a **third** naming scheme. **The cost exceeds the benefit this late and the call
is the owner's**, so it is a candidate for the next epic that splits a spec, not
a defect open against this one.

**THE ALLOCATION PROCEDURE — run it, do not quote it.** Three rounds of this
gate produced three actual cross-leg collisions, and rounds 5 and 6 each left
the two legs' own next-free statements contradicting each other. Every one of
those failures was a **number written down**. So no surface in either leg states
a next-free figure any more; they state **the command**, and it is run at write
time:

**Round 7's form had none of the three properties it needed, and round 8 measured
all three failures rather than reasoning about them.**

1. **PER PREFIX.** It sorted M- and V- ids into ONE ordered list
   (`sort -u -t- -k2 -n | tail -5`), so `tail` reports whichever prefix happens
   to hold the larger numbers and the other prefix is never reported at all.
   **Executed at `a516c77`, that form returned `M-48 M-49 M-50 M-51 M-52` and not
   one V id** — while the sentence beneath it stated a V figure the command had
   never produced.
2. **SELF-EXCLUDING.** It globbed every `\b[MV]-nn\b` **occurrence**, so a
   sentence saying an id was free made that id exist for the command. `V-33`
   occurs **exactly once in each leg** — in the sentence declaring it free — so
   the procedure's only evidence for its own answer was its own answer.
3. **COLLISION-DETECTING.** `sort -u` over the concatenation of both files
   *hides* an id defined on both sides, which is the exact failure rounds 4, 5
   and 6 each paid for. It also could not have seen the collision standing at its
   own head: **`M-52` is defined at this file's mutation row while the snapshot
   two paragraphs below declared `M-52` free.**

The procedure below is the repair. It enumerates **definitions** — a mutation
TABLE ROW, a verification STEP HEADER — never mentions, which is what makes it
self-excluding *by construction* rather than by an exclusion list: a sentence
quoting a figure is neither, so the procedure cannot read its own answer.

```bash
# THE NEXT FREE M- AND V- ID ACROSS BOTH LEGS. Per prefix, DEFINITION-SCOPED,
# per-leg-duplicate-detecting, cross-leg-collision-detecting. Run it; do not
# quote its output into either document.
#
# ROUND 9 CLOSED TWO POISONING ROUTES round 8 left open, both measured:
#  (a) NOT DEFINITION-SCOPED. `mdefs` matched every table-shaped line in the
#      file, so a stray `| M-999 | … |` anywhere — a quotation, an example, a
#      pasted review comment — moved the reported next-free to M-1000. The
#      extraction is now bounded to the Mutation-checks TABLE and to the
#      verification BLOCK, which is what Table H rows H1 and H3 mean by a
#      definition.
#  (b) `sort -u` BEFORE VALIDATION concealed SAME-LEG reuse: a second `# V-32`
#      header in the detector was deduplicated away and the step stayed green.
#      Occurrences are now preserved until the per-leg duplicate check has run,
#      and deduplicated only for the cross-leg comparison.
DET=docs/specs/WP-secret-fence-two-tier-detector.md
GATE=docs/specs/WP-secret-fence-ep2-redact-arm.md

# A MUTATION is defined by a row of that leg's Mutation-checks table — the table
# only, not any table-shaped line in the document.
mdefs() {
  awk '/^### Mutation checks /{t=1; next} t && /^## /{t=0} t' "$1" |
    grep -ohE '^\|[ *]*M-[0-9]+[a-z]?[ *]*\|' | grep -ohE 'M-[0-9]+[a-z]?'
}
# A VERIFICATION is defined by its step header inside that leg's ```bash block.
vdefs() {
  awk '/^```bash$/{b=1; next} b && /^```$/{b=0} b' "$1" |
    grep -ohE '^# V-[0-9]+[a-z]? ' | grep -ohE 'V-[0-9]+[a-z]?'
}
maxnum() { sed 's/^[MV]-\([0-9][0-9]*\).*/\1/' | sort -n | tail -1; }
# SAME-LEG REUSE, checked on OCCURRENCES before anything is deduplicated.
dupcheck() {   # <label> <occurrence-stream>
  local d
  d="$(printf '%s\n' "$2" | sort | uniq -d | tr '\n' ' ' | sed 's/ *$//')"
  if [ -n "$d" ]; then
    echo "FAIL allocation: $1 defines these id(s) MORE THAN ONCE: $d"
    echo "                 A second definition of a live id in the SAME leg is a"
    echo "                 collision too, and 'sort -u' is what hid it. Fix the"
    echo "                 duplicate; do not deduplicate it away."
    exit 1
  fi
}
MD="$(mdefs "$DET")"; MG="$(mdefs "$GATE")"
VD="$(vdefs "$DET")"; VG="$(vdefs "$GATE")"
dupcheck "the detector leg's Mutation-checks table" "$MD"
dupcheck "the EP2-gate leg's Mutation-checks table" "$MG"
dupcheck "the detector leg's verification block" "$VD"
dupcheck "the EP2-gate leg's verification block" "$VG"

printf 'M defined, detector leg : %s\n' "$(printf '%s\n' "$MD" | sort -u | tr '\n' ' ')"
printf 'M defined, EP2-gate leg : %s\n' "$(printf '%s\n' "$MG" | sort -u | tr '\n' ' ')"
printf 'V defined, detector leg : %s\n' "$(printf '%s\n' "$VD" | sort -u | tr '\n' ' ')"
printf 'V defined, EP2-gate leg : %s\n' "$(printf '%s\n' "$VG" | sort -u | tr '\n' ' ')"

# CROSS-LEG COLLISIONS. No M id may be defined in both legs. EXACTLY FIVE V ids
# may: V-1, V-10, V-11 and V-18 are inherited from the parent spec and mean the
# same check in both, and V-33 is DELIBERATELY SHARED — it is the same check over
# the same byte-identical section. Deduplication is legitimate HERE and only
# here, after the per-leg checks above have run.
MBOTH="$(comm -12 <(printf '%s\n' "$MD" | sort -u) <(printf '%s\n' "$MG" | sort -u) | tr '\n' ' ' | sed 's/ *$//')"
VBOTH="$(comm -12 <(printf '%s\n' "$VD" | sort -u) <(printf '%s\n' "$VG" | sort -u) | tr '\n' ' ' | sed 's/ *$//')"
if [ -n "$MBOTH" ]; then
  echo "FAIL allocation: M id(s) defined in BOTH legs: $MBOTH"
  exit 1
fi
if [ "$VBOTH" != "V-1 V-10 V-11 V-18 V-33" ]; then
  echo "FAIL allocation: the V ids defined in both legs are '$VBOTH', not the"
  echo "                 shared set 'V-1 V-10 V-11 V-18 V-33'."
  exit 1
fi

printf 'next free M: M-%s\n' "$(( $(printf '%s\n%s\n' "$MD" "$MG" | maxnum) + 1 ))"
printf 'next free V: V-%s\n' "$(( $(printf '%s\n%s\n' "$VD" "$VG" | maxnum) + 1 ))"
```

**Why the command and not the leg-tagged scheme** (`D-M-nn` / `G-M-nn`, this
document's own recorded alternative): the command is smaller, it needs no rename
across two accumulated review histories, and it removes the failure mode
completely rather than making it structurally impossible at the cost of a
third naming scheme. **Leg-tagged ids remain a recorded follow-up candidate**
and the owner's call, exactly as before.

**NO FIGURE AT ALL, NOT EVEN A DATED SNAPSHOT — round 8 dropped the carve-out
that let one stand.** Round 7 kept a "dated snapshot, marked as one" and the
snapshot was wrong on the day it was written: it read *union max `M-51`, `V-32`,
so the next free are `M-52` and `V-33`* while **this file's own mutation table
defines `M-52`**, in the same commit. That is the fourth allocation collision
this epic has paid for and the second one a snapshot caused. **The reviewers'
disposition is the one applied: drop snapshots entirely.** A reader who wants the
figure runs the procedure above; there is nothing left in either leg to go stale,
and nothing for the procedure to read back as its own input.

Concretely, for this leg:

1. An id inherited from the parent spec keeps its number **only while both legs
   use it for the same check** — that is the whole point of inheriting it, so a
   reader can trace a criterion across the split. V-1, V-10, V-11 and V-18 are
   in that state and stay where they are.
2. An id whose meaning **diverged** between the legs is reallocated **in this
   leg**, into the range the orchestrator issued: **M-34 … M-44 and V-21,
   V-29**, of which M-38 and M-39 are round 4's additions, M-42 is round 5's,
   **M-43 and V-29 are round 6's repairs**, and **M-44 is round 1 of the design
   gate's addition** — a new check rather than a reallocation, allocated from a
   reading taken across both files at write time.
3. The gaps in this leg's numbering (V-4, V-5, V-9, V-13, V-16, V-17; M-7 …
   M-12, M-16, M-17) are the parent spec's ids for checks **the split** assigned
   to the EP2-gate leg, and are not missing here. That is a statement about the
   split this document records in its own Provenance section — traceable here —
   and **not** about the sibling's current numbering, which is the distinction
   the next item turns on.
4. **Do not re-use a number this document has vacated.** M-18 … M-24, M-31,
   M-32, **M-33**, V-20, V-22 and **V-28** are retired in this leg. **This
   document does not say what they mean now** — a vacated id is vacated because
   the *sibling's current* numbering claimed it, and that is exactly the fact no
   check inside this leg can see. Round 6 removed this item's old tail, which
   asserted the retired numbers "mean the EP2-gate leg's checks and nothing
   else"; the retirement stands, the claim about whose they are does not.
   **The same rule governs every other cross-leg id this document might name.**
   Round 8 applied it to two surfaces that had drifted past it: the Mirrored
   Surface Checklist's intro named `V-26`, `V-30` and `V-31` as "the mechanized
   examples **in this document**" when **none of the three is defined here** —
   measured, this leg's block defines `V-1 V-2 V-2b V-2c V-2d V-2e V-3 V-6 V-7
   V-8 V-10 V-11 V-12 V-14 V-15 V-18 V-19 V-21 V-29 V-32` and nothing else — and
   V-32's own comment called its design "the V-26 treatment". Both now describe
   the mechanism and name only **V-32**, which is this leg's.

A future round that needs a new id in this leg **asks the orchestrator**, and
asks at the moment it writes. **Round 1 of the design gate needed one — M-44,
the isolated pre-separator quote mutation — and the allocation was re-measured
under the convention's own condition rather than carried forward.** The
architect held BOTH leg files in a single revision pass, with both final and no
agent writing to either, which is precisely the state the convention requires of
the orchestrator; the reading was taken then, by enumerating every `M-nn` and
`V-nn` occurrence in both documents. `M-44` was free and is now **live**.
**Next free: RUN THE ALLOCATION PROCEDURE ABOVE.** This sentence stated a
figure in rounds 5 and 6 and contradicted the sibling both times; **round 7
replaced it with a dated snapshot two paragraphs up, and that snapshot declared
`M-52` free in the same commit that defined `M-52` as a mutation row here.**
Three different ways of writing a number down, three collisions. Round 8 removed
the last of them, which is precisely the argument for running the procedure
rather than quoting anything.

**The reallocation map, recorded once so a PR comment or review note from ANY
round can still be read.** Each chain runs left to right and the rightmost id is
the live one.

- **M-18 → M-31 → M-40.** The second hop was needed because round 4 derived its
  own range instead of asking for one, and M-31 was in use on the other side.
- **M-19 → M-32 → M-41.** Same second hop, same reason as M-18.
- **M-20 → M-33 → M-43.** The second hop was needed because the range round 5
  was supplied had been measured before the sibling's concurrent round-5 pass
  landed, so M-33 was already taken on the other side when it was issued here.
- **M-21 → M-34**, **M-22 → M-35**, **M-23 → M-36**, **M-24 → M-37** — round 4,
  no second hop.
- **V-20 → V-21** — round 4, clean; no second hop, and it is the only V chain
  that needed none.
- **V-22 → V-28 → V-29.** First hop round 5, second hop round 6, for the same
  stale-measurement reason as M-20 → M-33 → M-43.

**One id that was never live also moved, and this is the trap for a round-5
reader.** Round 5's M4e paragraph and Table C3 row C3-17 both named **M-43** as
the id of the mutation that would close the pre-separator quote slot. That
mutation was never written. M-43 became the live `||`-separator mutation (former
M-33), and the unwritten one took a number issued when it was written — **which
happened in round 1 of the design gate, and the number issued was M-44.** So a
round-5 PR comment citing "M-43, the pre-separator mutation" means today's
**M-44**, while today's M-43 is the `||`-separator check. That is the chain, and
it is written out here rather than left as a coincidence of numbering because a
next-free figure quoted in a superseded round is exactly the kind of snapshot
this section exists to distrust.

ADR-0034's three references to the old V-20 were repaired in round 4 and
disclosed in that file's round-4 structural-correction block; **no ADR reference
needed repair in round 5 or in round 6**, because that file cites V-21, V-11 and
V-15 only, none of which has moved. Verified by grep over ADR-0034 in this pass:
it contains no `M-33`, no `V-28` and no `V-29`.

**What round 6's rename moved on the digest side, disclosed here because two
pinned regions cite the renamed ids.** `V-29` is cited inside **Table A row A8**
and `M-43` inside the **M4e register** — the two regions V-29 itself digests
whole — so the rename moves `A8_EXPECT` and `M4E_EXPECT`, and editing this prose
moves V-15's `SWEEP_EXPECT` with them. All three were recomputed by the architect
in this same pass, which is the reconciliation C3-18 and V-15 each require and
not a way around either. **No clause of A8 changed, no row of M4e was added,
reworded or removed, and no mutation changed what it mutates** — only the id
cited. `M1_EXPECT`, `M5_EXPECT`, `E3_EXPECT`, `ER_EXPECT`, V-18's threat-model
digest and both of V-21's ADR digests are untouched and were verified
byte-identical after the pass.

**What ROUND 1 OF THE DESIGN GATE moved on the digest side, disclosed in the same
shape and for the same reason.** This pass **did** change the pinned contract
surfaces, which round 6's did not:

- **`A8_EXPECT` moves.** Table A row A8's clause count went **ten → eleven**
  (the optional-whitespace clause the register had never named) and its
  quote-cardinality clause now distinguishes the two slots and cites C2 row 44.
  No clause was *added to the binding behaviour*: the whitespace allowance was
  already stated twice in A8's own text and the pre-separator slot was already
  governed by the same `?`; what changed is the row's own accounting of them.
- **`M4E_EXPECT` moves.** The M4e register gained the optional-whitespace row
  (eleventh) and its quote-cardinality row was rewritten to name both slots,
  both holders and both mutations.
- **`SWEEP_EXPECT` moves**, because essentially every prose surface in this
  document was touched: the Provenance section, the capture-point note, the
  discharged dispatch blocker and its four dependent passages, three Current-state
  line re-pins, the C2 corpus and its group prose, five C3 rows, three mutation
  cells, a new accepted residual and this paragraph.
- **Unchanged and verified byte-identical after the pass:** `M1_EXPECT`,
  `M5_EXPECT`, `E3_EXPECT`, `ER_EXPECT`, V-18's threat-model digest and both of
  V-21's ADR digests. **No measured vault figure moved**, which is why M1, M5 and
  the ADR's evidence blocks are untouched — the two binder residuals occur zero
  times on both measured corpora, so there was nothing to re-measure.

All three moved literals were recomputed by the architect **once, at the end of
this pass, and verified by running this document's own verification block** —
the reconciliation C3-18 and V-15 each require, not a way around either.

**What ROUND 9 moved on the digest side.** **Two literals: `SWEEP_EXPECT`, and
`V-33`'s new cross-leg digest over the shared check contracts.** Neither value is
written in this paragraph — see the round-8 note below for why that is forced
rather than coy. **Unchanged and verified byte-identical after the pass:**
`A8_EXPECT` and `M4E_EXPECT` (round 9 edited neither Table A row A8 nor the M4e
register), `M1_EXPECT`, `M5_EXPECT`, `E3_EXPECT`, `ER_EXPECT`, V-18's
threat-model digest in both legs, both of V-21's ADR digests, and — in the
sibling leg — V-11's owner-signature digest, V-20's provenance digest and the
`## OWNER-APPROVED` block. **Round 9 wrote no owner line, moved no owner byte,
and flipped no status.**

**What ROUND 8 moved on the digest side, disclosed in the same shape.** **Exactly
one literal moved: `SWEEP_EXPECT`. Neither its old value nor its new one is
written in this paragraph, and that is forced rather than coy** — this prose is
inside the swept region, so a copy of the literal here is a value the sweep reads
as its own input and the recomputation cannot converge. Measured in round 8:
naming the new value moved the digest again on the very next run, twice. **Read
the live value in the verification block; the previous one is in this file's
history at `a516c77`.** It moves because
round 8 edited prose almost everywhere in this document — Table L's row-37 holder
cell (round 6's unapplied reduction, applied), the Exact-contracts slice site,
V-2e's rationale, the id convention, the Completeness-registers rows for the
Checklist and for the id allocation, the Checklist's intro and three of its
bullets, and a new Implementation-notes section for V-32. **Recomputed once, at
the end, after every prose edit was final**, and the recomputation converges by
construction: `SWEEP_EXPECT` lives inside a ` ```bash ` fence, which
`spec_prose` strips, so writing the new literal does not move the value it pins —
verified, not assumed.

**Unchanged and verified byte-identical after the pass**, each recomputed and
compared against its pinned value: **`A8_EXPECT`** and **`M4E_EXPECT`** — round 8
deliberately edited neither Table A row A8 nor the M4e register, so C3-18's
reconciliation is not triggered and neither literal moves; **`M1_EXPECT`**,
**`M5_EXPECT`**, **`E3_EXPECT`**, **`ER_EXPECT`** — no measured figure moved;
**V-18's threat-model digest**, identical in both legs; **both of V-21's ADR
digests**; and, in the sibling leg, **V-11's owner-signature digest**, **V-20's
provenance digest** and the `## OWNER-APPROVED` block, which hashes to the same
value as at `a516c77`. **Round 8 wrote no owner line, moved no owner byte, and
flipped no status: all four specs remain `status: Draft`.**

```bash
set -euo pipefail

# The negative-check helper. `set -e` is suppressed for `! cmd`, so a negative
# assertion MUST carry its own `exit`. Usage: must_not "<message>" <cmd> [args…].
must_not() {
  local msg="$1"
  shift
  if "$@" >/dev/null 2>&1; then
    echo "FAIL: $msg"
    exit 1
  fi
}

# V-1  full suite, through the ONE wrapper that sets the scheduler guard
node tests/run.js

# V-2  A1: exactly one declaration of each alphabet constant, and NO other
#      character-class literal in the entropy pass. The old form printed a count
#      and exited 0 for any count >= 1 — it asserted nothing.
test "$(grep -c "^const ENTROPY_CORE_CLASS = 'A-Za-z0-9+=';$" src/core/secret-scan.js)" = "1"
test "$(grep -c "^const ENTROPY_WIDE_EXTRA = '/';$" src/core/secret-scan.js)" = "1"
must_not "today's hand-written alphabet literal [A-Za-z0-9+/=] is still present" \
  grep -qF '[A-Za-z0-9+/=]' src/core/secret-scan.js

# V-2b A13/C3-8: exactly ONE SEVERITY.REDACT producer.
#      Counted with grep -o | wc -l, i.e. OCCURRENCES, not lines: `grep -c`
#      counts lines and therefore cannot see two producers written on one line,
#      which is the only thing A13 exists to prevent. The expected value is 1,
#      not 2: `SEVERITY` is declared as `{ REDACT: 'redact', ... }`, so the
#      string `SEVERITY.REDACT` does not occur in the const, and A11 deletes
#      `severityForKey`. A correct build yields exactly one occurrence.
test "$(grep -o 'SEVERITY\.REDACT' src/core/secret-scan.js | wc -l | tr -d ' ')" = "1"

# V-2c A15: the escalation branch exists.
grep -q 'existing.severity = SEVERITY.QUARANTINE' src/core/secret-scan.js

# V-2d A16: the nineteenth labelled rule exists and emits at QUARANTINE.
grep -q "add('basic-auth', SEVERITY.QUARANTINE)" src/core/secret-scan.js

# V-2e A8: hasBoundContext's lookback is DERIVED from ScanLimits, never a
#      literal. Pinned as a WHOLE LINE.
#      RATIONALE LIVES IN THE IMPLEMENTATION NOTES, under "Why V-2e is a whole-
#      line pin, and why its rationale is not in the bash block" — NOT here.
#      That placement is round 6's structural repair, not a preference: prose
#      inside a ```bash fence is invisible to V-15's residue sweep, so a Table L
#      mirror living here could go stale with every gate green. See that section.
LOOKBACK_LINE='const CTX_LOOKBACK_MAX = 21 + ScanLimits.ENTROPY_CTX_FILLER_MAX + 12;'
SLICE_LINE='  const back = text.slice(Math.max(0, idx - CTX_LOOKBACK_MAX), idx);'
LINE_LINE='  const line = back.slice(back.lastIndexOf('"'"'\n'"'"') + 1);'
#      SCOPED TO hasBoundContext, AND THAT IS ROUND 9's REPAIR OF A DEAD-SHADOW
#      DEFEAT. Measured in round 9: a module carrying the three canonical lines
#      inside `if (false) { … }`, with a LIVE binder slicing from a literal,
#      passed all three whole-file pins AND the negative probe below — which
#      mutated the dead copy, not the runtime slice. Three changes close it:
#      (a) the pins run against the FUNCTION BODY, not the file; (b) the module
#      must contain EXACTLY ONE backward slice feeding the binder; (c) the
#      negative probe asserts the pin fires on the function body.
#      Written as printing `if`s, not bare `test`s: under `set -e` a bare test
#      exits 1 in SILENCE, and the reviewer's round-8 run aborted here with zero
#      output and had to be re-run under `bash -x` to find out which pin failed.
V2E_FN="$(mktemp)"
awk '/^function hasBoundContext/{f=1} f{print} f&&/^}$/{exit}' src/core/secret-scan.js >"$V2E_FN"
if [ ! -s "$V2E_FN" ]; then
  echo 'FAIL V-2e: hasBoundContext was not found as a module-scope function'
  echo '           declaration, so the pins below have nothing to scope to.'
  echo '           STOP AND REPORT; do not widen the pins back to the file.'
  rm -f "$V2E_FN"; exit 1
fi
v2e_pin() {   # <label> <expected-line> <file>
  if [ "$(grep -cxF "$2" "$3")" != "1" ]; then
    echo "FAIL V-2e: $1 does not occur EXACTLY ONCE in $3."
    echo "           want, byte for byte and at that indentation:"
    echo "           $2"
    echo "           A missing pin means the lookback is a literal somewhere; a"
    echo "           DUPLICATE means a dead shadow of the canonical line exists"
    echo "           beside a live one. Neither is repaired by editing this step."
    exit 1
  fi
}
v2e_pin 'the module-scope declaration' "$LOOKBACK_LINE" src/core/secret-scan.js
v2e_pin 'the slice site' "$SLICE_LINE" "$V2E_FN"
v2e_pin 'the same-line trim' "$LINE_LINE" "$V2E_FN"
#      EXACTLY ONE BACKWARD SLICE inside the binder. A second one is a dead
#      shadow or a live literal; either way the pins above stop meaning what
#      they say. Counted as OCCURRENCES (A13/C3-8), because two slices written
#      on one line are exactly the case a line count cannot see.
V2E_SLICES="$(grep -o 'text\.slice(' "$V2E_FN" | wc -l | tr -d ' ')"
if [ "$V2E_SLICES" != "1" ]; then
  echo "FAIL V-2e: hasBoundContext takes $V2E_SLICES backward slices of \`text\`, not 1."
  echo "           The canonical slice site is one expression. A second slice is"
  echo "           either a dead shadow of it or a live literal beside it, and"
  echo "           round 9 measured a module that passed every pin while the"
  echo "           binder read from the literal. Do not weaken this count."
  rm -f "$V2E_FN"; exit 1
fi
#      THREE WHOLE-LINE PINS, and the second is the USE SITE. `grep -cxF` counts
#      LINES, and here that is EXACT rather than a deviation from A13/C3-8's
#      occurrences-not-lines rule: `-x` requires the whole line to equal the
#      pattern, so a line can match at most once and occurrences and lines
#      coincide by construction. V-2b counts occurrences because ITS pattern is
#      an unanchored substring, which is the case that rule was written for.
#      WHAT THE ROUND-7 FORM WAS, and why it is gone: `grep -c 'CTX_LOOKBACK_MAX'
#      … -ge 2`. Executed in round 8 against a from-spec module carrying M-52 —
#      the declaration byte-perfect, the binder slicing with a literal — it
#      scored 3 and PASSED, because a JSDoc line naming the identifier is a line.
#      A token-line count cannot tell a read from a mention; a whole-line pin on
#      the slice expression can, because the mutation has to rewrite that line.
#      NEGATIVE PROBE — the slice pin actually discriminates M-52. Build a copy
#      with the lookback frozen at a literal and assert the pin goes RED. Without
#      this the pin is a string nobody has seen fire.
V2E_TMP="$(mktemp)"
#      (`99` deliberately, not Table L row L3's value: this probe lives inside a
#      ```bash fence, which V-15's residue sweep cannot see, so a canonical
#      figure written here would be an unswept mirror. Any literal breaks the
#      pin; the mutation is "a literal", not "that literal".)
sed 's/idx - CTX_LOOKBACK_MAX/idx - 99/' "$V2E_FN" >"$V2E_TMP"
if [ "$(grep -cxF "$LINE_LINE" "$V2E_TMP")" != "1" ]; then
  echo 'FAIL V-2e: the M-52 probe copy lost the same-line trim, so the probe below'
  echo '           would pass for the wrong reason. Report it; do not repin.'
  rm -f "$V2E_TMP" "$V2E_FN"; exit 1
fi
if [ "$(grep -cxF "$SLICE_LINE" "$V2E_TMP")" = "1" ]; then
  echo 'FAIL V-2e: the slice-site pin is blind to mutation M-52 — a module whose'
  echo '           binder slices with a literal still satisfies it. The pin is'
  echo '           wrong, not the module. Do not weaken it.'
  rm -f "$V2E_TMP" "$V2E_FN"; exit 1
fi
rm -f "$V2E_FN"
rm -f "$V2E_TMP"
#      The behavioural holder is NOT this step — see the Implementation notes.

# V-3  A10/A11: no labelled rule left at redact, the dead helpers are gone
must_not 'severityForKey / QUARANTINE_KEYS still exist (A11 deletes them)' \
  grep -q 'severityForKey\|QUARANTINE_KEYS' src/core/secret-scan.js

# V-6  the FN regression matrix and the FP ceiling (exit status carries the verdict)
node tests/run.js tests/unit/secret-fence.test.js

# V-7  reproduce M1/M5 on a real vault (owner-run, not CI)
node scripts/measure-secret-fp.js ~/Obsidian/gyula

# V-8  targeted suite for the detector's own unit tests
node tests/run.js tests/unit/secret-scan.test.js

# V-10 lint
npm run lint

# V-12 A8a: `SEP` is declared once, as ONE named constant, and its value is
#      EXACTLY the token alternation A8a decides. An equality, not a "does not
#      contain a bar" test: the members are now separated by `|` themselves, so
#      any bar-hunting pattern is either vacuous or wrong. The previous form
#      (`! grep -qE "SEP[A-Z_]* *= *['\"][^'\"]*\|"`) passed against UNMODIFIED
#      `main`, where no `SEP` exists at all — it asserted nothing, and an
#      implementer who inlined `[:=>]` satisfied it by never declaring the
#      constant. This form fails in both of those cases. See M4a and M4c for why
#      the exact membership is a gate rather than a preference.
#      The literal is bound to a SINGLE-QUOTED variable first, deliberately.
#      macOS ships bash 3.2, and bash 3.2 mis-parses a double-quoted string
#      nested inside "$( … )": measured 2026-07-26, writing this check inline
#      made it brace-expand `{1,3}`, run grep TWICE, and abort with
#      `test: too many arguments` (exit 2) instead of reporting the assertion.
#      Single-quoting also means the backslash below is the one literal
#      backslash that is in the file, with no shell doubling.
SEP_LINE='const SEP = /:{1,3}=|=>|\?=|[:=>]/.source;'
test "$(grep -cxF "$SEP_LINE" src/core/secret-scan.js)" = "1"
#      and the alternation is interpolated at its one use site, never re-spelled
test "$(grep -c ':{1,3}=' src/core/secret-scan.js)" = "1"

# V-14 AC-20, the interim contract: this leg changes NO gate, and touches
#      NOTHING outside the Deliverables table.
#
#      THE CHANGED SET IS WORKING-TREE-WIDE. `git diff --name-only origin/main...`
#      compares the merge base to the last COMMIT and is blind to an uncommitted
#      edit: measured on this repository it reported 0 paths while 22 files were
#      dirty, so an implementer could edit a forbidden file, run V-14 green, and
#      commit afterwards. The form below diffs the merge base against the WORKING
#      TREE (no `...`, no second commit) and adds untracked files, which no `git
#      diff` form ever reports.
changed_set() {
  { git diff --name-only "$(git merge-base origin/main HEAD)"
    git ls-files --others --exclude-standard
  } | sort -u
}

#      THE ENFORCER IS THE DELIVERABLES TABLE ITSELF. `scripts/boundary-check.js`
#      parses this spec's "## Deliverables" table and rejects any changed path
#      that is not in it, so the glob-shaped prohibitions (`docs/adr/*`,
#      `docs/specs/*` other than this file, `docs/specs/logbook/*`) are enforced
#      without being enumerated anywhere. It exits non-zero and prints the
#      offenders. An empty changed set means nothing was implemented, so it is
#      a failure here rather than a vacuous pass.
test -n "$(changed_set)"
# shellcheck disable=SC2046
node scripts/boundary-check.js docs/specs/WP-secret-fence-two-tier-detector.md $(changed_set)

#      A louder message for the files most likely to be reached for by mistake.
#      This list is NOT the enforcement — boundary-check.js above already covers
#      it — it exists so the failure names the leg that owns the file. Written as
#      a function so the negative probe can run the SAME guard.
#      IT ALSO CARRIES THE ONE PATH boundary-check.js WILL NEVER REJECT.
#      `scripts/boundary-check.js:48` hard-codes `memory/lessons/inbox.md` as
#      always-allowed for every spec (verified 2026-07-26: feeding it that path
#      alone exits 0). This WP does not exempt it, and CLAUDE.md forbids editing
#      it on a WP branch — parallel branches conflict on merge, so lessons go in
#      the PR body and the maintainer appends them on `main`. The checker is out
#      of this WP's boundary and must NOT be modified to fix this; the rejection
#      belongs here instead.
leg2_guard() {   # reads a changed set on stdin
  local set f
  set="$(cat)"
  for f in src/core/dream/validate.js src/core/digest.js src/cli/dream.js \
           src/cli/sync.js src/core/transcripts/index.js src/core/alerts.js \
           src/core/dream/brain.js src/cli/run-job.js src/core/run-evidence.js \
           tests/unit/dream-validate.test.js tests/unit/digest.test.js \
           docs/runbooks/secret-incident.md; do
    if printf '%s\n' "$set" | grep -qxF "$f"; then
      echo "FAIL V-14: $f is in the diff. That file belongs to WP-secret-fence-ep2-redact-arm."
      return 1
    fi
  done
  if printf '%s\n' "$set" | grep -qxF 'memory/lessons/inbox.md'; then
    echo "FAIL V-14: memory/lessons/inbox.md is in the diff. boundary-check.js allows it"
    echo "           unconditionally, but CLAUDE.md forbids editing it on a WP branch."
    echo "           Put your lessons in the PR body instead. Do not edit the checker."
    return 1
  fi
  return 0
}
changed_set | leg2_guard

#      NEGATIVE PROBE 1 — the guard discriminates. The SAME function, fed the
#      same set plus one forbidden path, must exit non-zero. Without this the
#      guard is green whenever `changed_set` is empty for any reason.
if { changed_set; echo 'src/core/digest.js'; } | leg2_guard >/dev/null; then
  echo 'FAIL V-14: the guard accepted a changed set containing src/core/digest.js.'
  exit 1
fi

#      NEGATIVE PROBE 1b — and it rejects the path boundary-check.js waves
#      through. Without this probe the inbox rejection above is untested prose:
#      boundary-check.js allows the path, so nothing else in V-14 would notice.
if { changed_set; echo 'memory/lessons/inbox.md'; } | leg2_guard >/dev/null; then
  echo 'FAIL V-14: the guard accepted a changed set containing memory/lessons/inbox.md.'
  exit 1
fi
#      and the premise is real: boundary-check.js accepts it for THIS spec.
node scripts/boundary-check.js docs/specs/WP-secret-fence-two-tier-detector.md memory/lessons/inbox.md

#      NEGATIVE PROBE 2 — `changed_set` really does see the working tree. An
#      UNTRACKED file must appear in it; `git diff --name-only origin/main...`
#      never reports one, so this probe fails against the old form.
#
#      THE PROBE PATH IS UNIQUE PER RUN AND ITS ABSENCE IS ASSERTED FIRST, AND
#      THAT IS A DATA-LOSS REPAIR RATHER THAN TIDINESS. The round-6 form did
#      `touch .wd-v14-untracked-probe` on a FIXED name and then `rm -f` it on
#      both branches, without first proving the file was absent — so if a
#      developer already had untracked work at that path, `touch` preserved the
#      contents and the unconditional `rm -f` destroyed them. **A verification
#      command this spec prescribes must not have a data-loss path**, which is
#      the same rule V-14's own package.json probe below already follows and
#      which round 3 applied to the sibling leg's V-0 probe for the same reason.
#      Three changes, all required: a name that cannot collide (`$$` is the
#      shell's pid), a refusal to run if it somehow exists anyway, and a trap so
#      an abort mid-probe still cleans up.
V14_PROBE=".wd-v14-untracked-probe.$$"
if [ -e "$V14_PROBE" ]; then
  echo "FAIL V-14: $V14_PROBE already exists. This probe creates and deletes that"
  echo "           path; it refuses to run against an existing file so it can never"
  echo "           destroy one. Remove or rename it yourself, then re-run."
  exit 1
fi
trap 'rm -f "$V14_PROBE"' EXIT
: > "$V14_PROBE"
if changed_set | grep -qxF "$V14_PROBE"; then
  rm -f "$V14_PROBE"; trap - EXIT
else
  rm -f "$V14_PROBE"; trap - EXIT
  echo 'FAIL V-14: changed_set is blind to untracked files.'; exit 1
fi

#      NEGATIVE PROBE 3 — and it sees an UNSTAGED edit to a TRACKED file.
#      `package.json` is not in the Deliverables table, so it must start clean;
#      that precondition is asserted first, which is what makes the
#      `git checkout --` restore safe.
if changed_set | grep -qxF 'package.json'; then
  echo 'FAIL V-14: package.json is already modified; it is not in the Deliverables table.'
  exit 1
fi
printf '\n' >> package.json
if changed_set | grep -qxF 'package.json'; then P3=ok; else P3=bad; fi
git checkout -- package.json
test "$P3" = ok

#      and EP2's condition is still the one this WP promises it is
grep -qF 'if (findings.length === 0) continue;' src/core/dream/validate.js
must_not 'validate.js now references hasHardFinding — that is leg 2' \
  grep -q 'hasHardFinding' src/core/dream/validate.js

# V-15 M1 and M5 still agree with ADR-0034's evidence E1 and E3. ADR-0034 is the
#      hub: the EP2-gate leg pins the same figures to the same lines, so this is
#      what keeps the two legs in agreement without either reading the other.
#      If one of these fails, do NOT edit the ADR — a measured figure is repaired
#      by a dated errata amendment inside ADR-0034 by the architect, never by an
#      implementer and never on the spec side alone.
#      BLOCK DIGESTS, NOT PER-LINE PINS (round 3, second pass). The previous
#      form pinned 2 of the 7 lines of the M1/E1 evidence block. Measured
#      2026-07-26, THREE constructed drift states passed it green while the two
#      documents disagreed: (a) the `distinct high-entropy runs` line differing
#      by one between the two files — the figures are M1's and are deliberately
#      not written here, because this comment is inside a fence the residue
#      sweep cannot see; (b) the `high-entropy ONLY` and `findings by
#      rule` lines edited apart; (c) ER-4's own errata row rewritten to figures
#      that contradict the block it corrects. A fourth attack needs no drift at
#      all: `grep -c` counts LINES, so two contradictory claims written on ONE
#      line each count 1 and both pins stay green.
#      A whole-block digest closes all four at once and has no per-line pin to
#      forget when a line is added — the V-18 pattern, applied to evidence
#      instead of to a ratified section.
#      SCOPE, stated so nobody widens it by reflex: these digests cover the
#      MIRRORED evidence blocks only. Every line outside them, in either
#      document, figure-bearing or not, is covered by the RESIDUE SWEEP further
#      down this step, which selects no lines by content and therefore has no
#      list that can be short. What it DOES still take by hand is its REGION —
#      two named files, minus the fenced ```bash blocks on the spec side and
#      minus the frontmatter `status:` line (round 1's deadlock repair, argued
#      where spec_residue is defined). See "Completeness registers and what
#      actually bounds each" for what that leaves uncovered; it is not nothing,
#      and it is not claimed to be.
#      WHEN THIS GOES RED LEGITIMATELY: a re-measurement (the vault is a live
#      corpus). The repair is a DATED ERRATA AMENDMENT inside ADR-0034 by the
#      ARCHITECT, who recomputes these digests in the same pass — never an
#      implementer, never on the spec side alone, and never by recomputing a
#      digest without amending the ADR.
ADR=docs/adr/0034-accidental-persistence-threat-model.md
SPEC=docs/specs/WP-secret-fence-two-tier-detector.md

#      M1 (spec) and E1 (ADR) are BYTE-IDENTICAL blocks. One digest holds both
#      copies AND their equality to each other, so neither can move alone.
#      The range is content-addressed (first line to last line of the block),
#      so a deleted line yields a different digest rather than a shorter range,
#      and a duplicated block is swept into the same range and also fails.
m1_digest() { sed -n '/^notes scanned /,/^distinct high-entropy runs /p' "$1" | shasum -a 256 | cut -d' ' -f1; }
M1_EXPECT=f77cf4a625f0ecce7467725c3ac702801cbeb87e670fd117eefa71bb2a32af52
if [ "$(m1_digest "$SPEC")" != "$M1_EXPECT" ] || [ "$(m1_digest "$ADR")" != "$M1_EXPECT" ]; then
  echo "FAIL V-15: the M1/E1 evidence block no longer matches its pinned digest."
  echo "           spec: $(m1_digest "$SPEC")"
  echo "           ADR : $(m1_digest "$ADR")"
  echo "           want: $M1_EXPECT"
  echo "           Do NOT recompute this to make it pass. See the note above."
  exit 1
fi

#      M5 (spec) and E3 (ADR) state the same end-state figures in different
#      prose, so they get one digest each rather than a shared one. E3 is a
#      PARAGRAPH, which is exactly where a per-line pin cannot see two
#      contradictory claims on one line.
m5_digest() { awk '/^\*\*M5 — /{f=1} /^\*\*M5a — /{f=0} f' "$1" | shasum -a 256 | cut -d' ' -f1; }
e3_digest() { awk '/^\*\*E3 — /{f=1} /^\*\*E4 — /{f=0} f' "$1" | shasum -a 256 | cut -d' ' -f1; }
M5_EXPECT=bc9704893fc2a181f844c95097f15931e5c7a46c5734fd93544583b4ad1fb021
E3_EXPECT=bf0aeb7292c2d37b8d8c51809f1a71f175e857013097bad99ff93227e551a182
if [ "$(m5_digest "$SPEC")" != "$M5_EXPECT" ]; then
  echo "FAIL V-15: the spec's M5 block moved. got $(m5_digest "$SPEC"), want $M5_EXPECT"
  exit 1
fi
if [ "$(e3_digest "$ADR")" != "$E3_EXPECT" ]; then
  echo "FAIL V-15: the ADR's E3 paragraph moved. got $(e3_digest "$ADR"), want $E3_EXPECT"
  exit 1
fi

#      ADR-0034's ERRATA ROWS. Each one summarizes the evidence it corrected, so
#      each is a fourth copy of these figures — and they sit inside markdown
#      TABLES, which the old `^[^|]*` guard deliberately excluded, because those
#      rows legitimately quote SUPERSEDED figures. Measured 2026-07-26: with the
#      block digests in place, rewriting ER-4's row to "**183** notes scanned,
#      **104** with any finding, **56.8%**" still passed every other check in
#      V-15. So the rows are digested WHOLE, which needs no rule about which
#      figures inside them are live and which are historical: an errata row is a
#      dated record, and a dated record does not change after it is written.
#      Adding ER-7 changes this digest — deliberately. Adding an errata row is
#      an architect act that already carries a disclosure; recomputing this
#      literal in the same pass is part of it.
er_digest() { grep '^| ER-' "$1" | shasum -a 256 | cut -d' ' -f1; }
ER_EXPECT=2d85c7ac7fba24f42413dd7698ec76bee553b399f63c131e827b0a23bfdd53eb
if [ "$(er_digest "$ADR")" != "$ER_EXPECT" ]; then
  echo "FAIL V-15: an ADR-0034 errata row moved. got $(er_digest "$ADR"), want $ER_EXPECT"
  echo "           An errata row is a dated historical record. If you added one,"
  echo "           the architect recomputes this literal in the same pass."
  exit 1
fi

#      THE RESTATEMENT SWEEP — THE WHOLE NON-BLOCK RESIDUE (round 5). One shape
#      has failed three times here, and each repair moved the hand-maintenance
#      one level up instead of deleting it: round 3's hand-listed M4e clause
#      register; round 4's five hand-listed out-of-block pins; and round 4's
#      replacement for those pins — a GENERATED sweep filtered through a
#      HAND-WRITTEN vocabulary of figure shapes. Measured 2026-07-26 that
#      vocabulary was short in the same way its predecessors were: appending
#      "100 notes fire on high-entropy alone", or "80 notes untouched before the
#      change" — real measured figures whose shapes it did not list — left the
#      digest BYTE-IDENTICAL and this step green. A vocabulary is a register
#      with a different name, so there is none any more: the sweep removes every
#      range a block digest above already covers and digests EVERYTHING that
#      remains. A line added or changed anywhere INSIDE THE SWEPT REGION moves
#      this digest whatever words it carries; no list selects lines by content,
#      so no list can be short.
#
#      WHAT IS STILL HAND-DRAWN IS THE REGION, NOT A LIST, AND SAYING SO IS THE
#      POINT. The sweep covers two named files, and on the spec side it covers
#      everything except the fenced ```bash blocks and the frontmatter `status:`
#      line (round 1's deadlock repair). So a figure-bearing line written
#      INSIDE one of those blocks is not swept — and ROUND 5's REVIEW FOUND
#      EXACTLY THAT: V-2e's rationale, a registered Table L mirror, was living
#      in a fence and went stale under two clean sweeps. Round 6 moved it out
#      rather than widening the sweep, which is this gate's own stated remedy,
#      and the Checklist now forbids a Table L mirror inside a fence at all.
#      See "Completeness registers and what actually bounds each" for this
#      gate's row. The claim here is "complete over its region", never
#      "complete".
#
#      THE COST, STATED RATHER THAN DISCOVERED: this is a HIGH-CHURN gate. Any
#      prose edit to either document — a typo fix, a reworded criterion, a moved
#      line-number citation — reddens it, and the ARCHITECT recomputes the
#      literal in the same pass as the edit. That is the intended trade for a
#      spec about to be frozen and dispatched, and strictly the cheaper failure:
#      a recomputation somebody performs knowingly, against a silent
#      contradiction between this spec and a ratified ADR that nobody performs.
#
#      THE SELF-MATCH HAZARD IS NOW A CONVERGENCE REQUIREMENT, AND IT IS WHAT
#      FORCES THE ONE HAND-DRAWN EDGE THIS GATE HAS. The spec side is swept
#      through a PROSE VIEW with every fenced ```bash block removed. That view
#      used to stop the shape list from grepping itself; now it is what makes the
#      digest computable AT ALL, because SWEEP_EXPECT lives in this block and a
#      sweep that read its own expected value could never converge on a fixed
#      one. The exclusion is therefore forced by arithmetic, not chosen for
#      convenience — but it is still an exclusion, and it is load-bearing that
#      nobody reads it as free.
#      WHY IT IS TOLERABLE, STATED PRECISELY RATHER THAN WAVED AT. These blocks
#      DO quote exact drift figures — the probe strings a few lines below carry
#      "100 notes fire on high-entropy alone" and "80 notes untouched before the
#      change", which are wrong on purpose. That is exactly why they are not
#      mirrors: a mirror is prose a reader could believe, and these are inputs to
#      a check whose whole job is to prove the sweep NOTICES them. A reader who
#      took one as a measurement would be reading an assertion that the sweep
#      goes red. What the exclusion does cost is real and is stated in the
#      completeness-registers table: a figure restated as ORDINARY PROSE inside a
#      ```bash block would not be swept.
#      "NOTHING PUTS PROSE THERE TODAY" STOOD HERE FOR THREE ROUNDS AND WAS
#      FALSE IN EVERY ONE OF THEM. Round 5's review found V-2e's ~30-line
#      rationale in a fence; round 6's repair moved that block out and mandated
#      this sentence be corrected; the sentence was NOT corrected, and round 7
#      then wrote seventeen more lines of rationale into V-32's fence. Round 8
#      measured it and applied the remedy twice: V-32's rationale is now in the
#      Implementation notes beside V-2e's, and this sentence says what is
#      actually true.
#      WHAT IS ACTUALLY TRUE. This block is FULL of prose — every step carries a
#      comment explaining itself, and that is deliberate and stays. The rule is
#      narrower than "no prose": NO MIRROR OF A CANONICAL SURFACE may live in a
#      fence — no figure a canonical table decides, no clause of a contract row,
#      no rationale a Checklist bullet registers. Rationale about a CHECK is not
#      a mirror; rationale that reproduces what a TABLE decides is. The two that
#      crossed that line (V-2e's, V-32's) were moved out, not swept.
#      THE RULE CARRIES ITS CHECK, per this document's own no-absolute-without-
#      an-executed-check standing rule. Executed in round 8 over this fence:
#        awk '/^```bash$/{f=1} f{print NR": "$0} f&&/^```$/{f=0}' <spec> \
#          | grep -E '\b(53|73|17|55|20|40|44|39|182|102|101|106|299)\b'
#      Every surviving hit is one of FOUR dispositioned kinds, and none is a
#      free-standing restatement of a figure a canonical table decides:
#        (1) a V-15 negative-probe string — an INPUT to a check whose whole job
#            is to prove the sweep notices it, never prose a reader could
#            believe;
#        (2) an id whose number the word boundary catches (`AC-20`, `AC-17`,
#            `C3-8`, `M-44`, `V-15`);
#        (3) this grep's own pattern and its disposition list, i.e. these lines;
#        (4) a V-32 SCHEMA KEY, which quotes a table header VERBATIM — including
#            M4b's `filler ≤ 20 | filler ≤ 40`. That is a lookup key, not a
#            claim, and it is self-correcting rather than stale-able: if the
#            header ever changed, the key would stop matching and V-32 would
#            fail loudly with "the table at line N has NO schema entry".
#      Re-run the grep when you edit this block, and disposition every new hit
#      into one of those four or move it out.
#      A review that finds a canonical mirror here treats it as a defect on
#      sight and MOVES IT OUT — it does not widen the sweep, and it does not
#      leave the correction to the next round, which is what round 6 did.
#      The ADR side needs no view; no checker lives there. Whitespace runs are
#      collapsed first, so a reflow that changes no words costs no recomputation.

#      Range removers. drop_incl drops the terminating line too (the M1/E1
#      block is delimited by its own first and last lines); drop_excl stops
#      before it (M5 and E3 are delimited by the heading of what follows).
drop_incl() { awk -v s="$1" -v e="$2" '!f && $0 ~ s {f=1} f {if ($0 ~ e) f=0; next} {print}'; }
drop_excl() { awk -v s="$1" -v e="$2" '!f && $0 ~ s {f=1} f && $0 ~ e {f=0} f {next} {print}'; }

#      Every view takes its file as an ARGUMENT, so the negative probes below can
#      run the same pipeline over a modified copy. A probe that appends to the
#      sweep's OUTPUT instead would change the digest unconditionally and assert
#      nothing.
spec_prose()   { awk '/^```bash$/{f=1} !f{print} f&&/^```$/{f=0}' "$1"; }
#      THE FRONTMATTER `status:` LINE IS EXCLUDED, AND IT IS A DEADLOCK REPAIR
#      RATHER THAN A CONVENIENCE. Round 1 of the design gate measured this step
#      RED ON ARRIVAL: the sweep digests this document's own prose INCLUDING its
#      YAML frontmatter, and BOTH status transitions this spec's own lifecycle
#      mandates move the digest. Measured on the pre-repair text —
#        status: Draft      -> 39256517bc3dfd6d38d50369b961dabcbc5c73ed90f3028a538400fef84044f7  (= the pinned value)
#        status: Ready      -> 1f05ddbdb5d3310171c146c3a734da316db8f4d993e9dcbdc18f7758eba60ca9
#        status: In-Review  -> 38b2c7f4cb30ae22bfc1bde7f546558d8a4710bbec6328bdc08fdc7b6d3be242
#      — so flipping this spec to `Ready`, which is the very act the design gate
#      exists to authorise, reddened it before an implementer wrote a line; and
#      Definition-of-done items 1 ("all verification steps pass locally") and 4
#      ("this spec's status: flipped to In-Review in the same PR") were JOINTLY
#      UNSATISFIABLE, with this step's own failure text instructing the
#      implementer to REVERT the edit item 4 requires.
#      Dropping the one line closes it. `status:` is not a measured figure, it is
#      not a contract, and no mirror of it exists — it is lifecycle bookkeeping
#      the orchestrator moves twice per WP by design. Everything else in the
#      frontmatter (id, title, depends_on, adrs, epic, size, model) is STILL
#      SWEPT, which NEGATIVE PROBE 2b's second assertion below proves rather
#      than asserts — for EVERY one of the seven, since round 3: it loops over
#      the keys instead of perturbing one and generalising. (Round 2 corrected the pointer: there is no "probe 4" and
#      never was — a dangling cross-reference to a probe that does not exist.)
#      The repair is NOT "tell the implementer to skip V-15": a gate with a
#      documented exemption is a gate nobody runs.
spec_residue() {
  spec_prose "$1" \
    | sed '/^status: /d' \
    | drop_incl '^notes scanned ' '^distinct high-entropy runs ' \
    | drop_excl '^\*\*M5 — ' '^\*\*M5a — '
}
adr_residue() {
  drop_incl '^notes scanned ' '^distinct high-entropy runs ' < "$1" \
    | drop_excl '^\*\*E3 — ' '^\*\*E4 — ' \
    | grep -v '^| ER-'
}
restatement_sweep() {   # <spec-path> <adr-path>
  { spec_residue "$1" | sed 's/^/SPEC /'
    adr_residue  "$2" | sed 's/^/ADR  /'
  } | sed 's/[[:space:]][[:space:]]*/ /g'
}

#      NEGATIVE PROBE 1 — the prose view really does strip this block. If it did
#      not, the sweep would read SWEEP_EXPECT and no fixed value could satisfy it.
if spec_prose "$SPEC" | grep -qF 'restatement_sweep() {'; then
  echo 'FAIL V-15: spec_prose did not strip the verification block.'
  exit 1
fi
#      NEGATIVE PROBE 2 — the removers really do remove. The M1/E1 block's own
#      first line must be absent from BOTH residues; if a remover silently
#      stopped matching, every digested figure would re-enter the residue and
#      this step would be pinning the wrong thing.
if spec_residue "$SPEC" | grep -q '^notes scanned ' ||
   adr_residue  "$ADR"  | grep -q '^notes scanned '; then
  echo 'FAIL V-15: a digested block is still present in the residue.'
  exit 1
fi

#      NEGATIVE PROBE 2b — THE `status:` EXCLUSION IS EXACTLY ONE LINE WIDE.
#      Two assertions, and both are needed. (a) POSITIVE: the three status values
#      this spec's lifecycle uses must all produce the SAME residue, which is the
#      deadlock repair working. (b) NEGATIVE: a DIFFERENT frontmatter line must
#      still move it — without this, `sed '/^status: /d'` could be widened to
#      `sed '/^[a-z_]*: /d'` by a later "tidy-up" and silently stop sweeping
#      `depends_on`, `adrs` and `epic`, which ARE contract surfaces.
#      (b) LOOPS OVER EVERY NON-STATUS KEY, and round 3 is why. Its first form
#      perturbed `epic:` ALONE while the comment claimed the exclusion was
#      proven "from both sides" — a claim about seven keys proven for one.
#      Measured 2026-07-27: all seven ARE genuinely swept, so the claim was
#      true and the proof was one seventh. It is also insufficient against the
#      concrete attack: a widened exclusion that hides an `adrs:` edit passes a
#      probe that only perturbs `epic:` — executed and confirmed. The loop
#      costs seven sweeps and closes both.
#      (a) IS WRITTEN AS A NORMALIZING SUBSTITUTION OVER ALL THREE VALUES, AND
#      THAT IS ROUND 2'S REPAIR OF ROUND 1'S REPAIR. The first form built its
#      comparison copies with `sed 's/^status: Draft$/status: Ready/'`, which
#      substitutes ONLY while the status is literally `Draft`. The moment this
#      spec flips to `Ready` — which is the transition the design gate exists to
#      authorise — both copies become NO-OPS, all three digests are trivially
#      equal, and the assertion passes unconditionally FOR THE WHOLE
#      POST-DISPATCH LIFE OF THE SPEC. Measured in round 2 across a twelve-cell
#      matrix (spec status × exclusion present/removed × old form/new form);
#      THE FOUR DISCRIMINATING CELLS are shown — round 3 corrected a claim that
#      the full matrix was printed when four of twelve were:
#        old form, Draft, exclusion removed -> FAILS (correct)
#        old form, Ready, exclusion removed -> PASSES (VACUOUS — the deadlock is
#                                              back and the probe cannot see it)
#        new form, Draft, exclusion removed -> FAILS (correct)
#        new form, Ready, exclusion removed -> FAILS (correct)
#      The `.*` form normalizes FROM whatever the status currently is TO each of
#      the three values, so every copy is a real rewrite regardless of the
#      starting value, and each is compared against the unmodified spec's own
#      sweep rather than against its siblings.
V15_S="$(restatement_sweep "$SPEC" "$ADR" | shasum -a 256 | cut -d' ' -f1)"
for v in Draft Ready In-Review; do
  V15_T="$(mktemp)"
  sed "s/^status: .*/status: $v/" "$SPEC" >"$V15_T"
  V15_G="$(restatement_sweep "$V15_T" "$ADR" | shasum -a 256 | cut -d' ' -f1)"
  rm -f "$V15_T"
  if [ "$V15_G" != "$V15_S" ]; then
    echo "FAIL V-15: the status: exclusion is not working — rewriting status to"
    echo "           '$v' moved the residue, which is the deadlock this repair closed."
    exit 1
  fi
done
for k in id title model size depends_on adrs epic; do
  V15_C="$(mktemp)"
  sed "s/^$k: .*/$k: WD-PROBE-VALUE/" "$SPEC" >"$V15_C"
  V15_E="$(restatement_sweep "$V15_C" "$ADR" | shasum -a 256 | cut -d' ' -f1)"
  rm -f "$V15_C"
  if [ "$V15_E" = "$V15_S" ]; then
    echo "FAIL V-15: the sweep is blind to a change in the frontmatter key '$k'."
    echo '           The status exclusion was widened past its one line, so a'
    echo '           contract surface is no longer swept. Narrow it back; do not repin.'
    exit 1
  fi
done

SWEEP_BASE="$(restatement_sweep "$SPEC" "$ADR" | shasum -a 256 | cut -d' ' -f1)"

#      NEGATIVE PROBE 3 — the sweep sees a line added ANYWHERE. Each string is
#      appended to a COPY of the ADR and must move the digest. The first five
#      are measured figures the round-4 vocabulary DID NOT MATCH and therefore
#      missed; the sixth carries no figure at all, and it is the one that proves
#      this gate covers prose rather than numbers. They are examples, NOT a
#      register — the sweep's coverage does not depend on them, so deleting one
#      weakens the demonstration and not the gate.
for probe in \
  'a drifted restatement: 172 notes untouched, 56.6% reverted' \
  '100 notes fire on high-entropy alone' \
  '101 notes fire on high-entropy alone' \
  '80 notes untouched before the change' \
  '299 distinct high-entropy runs' \
  'an ordinary sentence that states no figure at all'
do
  V15_TMP="$(mktemp)"; cp "$ADR" "$V15_TMP"; printf '%s\n' "$probe" >> "$V15_TMP"
  V15_GOT="$(restatement_sweep "$SPEC" "$V15_TMP" | shasum -a 256 | cut -d' ' -f1)"
  rm -f "$V15_TMP"
  if [ "$V15_GOT" = "$SWEEP_BASE" ]; then
    echo "FAIL V-15: the sweep is blind to an appended line: $probe"
    exit 1
  fi
done

SWEEP_EXPECT=bd42b5d31e0590dc34810053fbb94affb67a4b13b182bcd1064104871655be00
if [ "$SWEEP_BASE" != "$SWEEP_EXPECT" ]; then
  echo "FAIL V-15: the non-block prose residue of one of the two documents moved."
  echo "           got  $SWEEP_BASE"
  echo "           want $SWEEP_EXPECT"
  echo "           This covers every line of both documents outside the blocks"
  echo "           digested above, so it is not reprinted: the moved line is"
  echo "           whatever was last edited. EDITED PROSE, as the implementer?"
  echo "           Revert it. A MEASURED FIGURE MOVED? The repair is a DATED"
  echo "           ERRATA AMENDMENT inside ADR-0034, by the ARCHITECT, who"
  echo "           recomputes this literal in the same pass — never here, never"
  echo "           on the spec side alone, never by an implementer."
  exit 1
fi

# V-29 A8's ROW AND M4e's REGISTER ARE PINNED WHOLE, BY DIGEST (C3-18).
#      Same defect class as the sweep above, same repair, third occurrence.
#      M4e calls itself the register of every clause A7 and A8 state; round 3
#      found it short by two clauses and round 4 by two more, both times while
#      it claimed completeness in prose. Round 4's repair put an OPT-IN `[C]`
#      marker on each clause of A8 and each row of M4e and asserted the counts
#      equal — and round 5 measured it blind: an UNMARKED clause added to A8,
#      and a second semantic clause placed beside an existing marker, each left
#      `A8 = 9`, `M4e = 9` and every assertion green. A marker count never looks
#      at the clauses, only at the markers somebody remembered to type, and
#      round 4's own probe added a MARKER rather than a clause.
#      So the markers are GONE from both surfaces and each region is digested
#      WHOLE — the V-18 pattern applied to a contract instead of to a ratified
#      section. Any clause added to A8, marked or not, or extended in place,
#      moves its digest; any register row added, reworded or deleted moves
#      M4e's; the architect reconciles the pair and recomputes both literals in
#      one disclosed pass. Nothing is left to opt in to. TWO digests rather than
#      one so the diagnostic can name the side that moved — V-15's residue sweep
#      covers both regions and reddens too, but it can only report that some
#      line of a two-thousand-line residue moved.
#      ANCHORED AT LINE START, and not cosmetically: this step's own text
#      contains the literal `| A8 | context binding`, so an unanchored pattern
#      digests the checker along with the document (the self-match hazard V-15
#      and V-11 both carry; `|` is literal in a BRE). The old separate "exactly
#      one A8 row" count is subsumed — a duplicated row is swept into the same
#      digest — and so is an empty match: `e3b0c442…` below means the row or the
#      header was RENAMED, which is what probe 3 exists to catch.
a8_digest()  { grep '^| A8 | context binding' "$1" | shasum -a 256 | cut -d' ' -f1; }
m4e_digest() { awk '/^\| clause \| held by \| mutation \|$/{f=1} f&&/^$/{f=0} f' "$1" |
                 shasum -a 256 | cut -d' ' -f1; }
A8_EXPECT=908892b2d992301f72f705dae80fd41d01ca04932ba068fcb4f0bc578d30f70b
M4E_EXPECT=f5b90e8c83af1e893fccd61b96abd2a8378eae3b8137688eaca459c4e7b0f541
if [ "$(a8_digest "$SPEC")" != "$A8_EXPECT" ]; then
  echo "FAIL V-29: Table A row A8 moved. got $(a8_digest "$SPEC"), want $A8_EXPECT"
  echo "           A clause was added, extended, reworded or removed. M4e gains"
  echo "           or loses its matching row in the SAME pass, and only the"
  echo "           architect recomputes these literals: A8 is a canonical row."
  exit 1
fi
if [ "$(m4e_digest "$SPEC")" != "$M4E_EXPECT" ]; then
  echo "FAIL V-29: the M4e register moved. got $(m4e_digest "$SPEC"), want $M4E_EXPECT"
  echo "           Same rule in the other direction: A8's clauses must still"
  echo "           account for every row, and the rows for every clause."
  exit 1
fi

#      NEGATIVE PROBES — each edits a COPY and must move the digest it names.
#      Probe 1 is what the round-4 marker count could not see: clause text
#      appended to A8 with NO marker. Probe 2 is the other blind case, a second
#      clause where a marker already sat — with the markers gone that state HAS
#      NO EXPRESSIBLE FORM, which is the point, so the probe takes its nearest
#      survivor: clause text inserted mid-row instead of at the end. Probe 3 the
#      round-4 form never had at all, and it is what proves m4e_digest's range
#      reads the register rather than digesting an empty match.
v29_probe() {   # <what-it-simulates> <sed-program> <digest-fn> <baseline>
  V29_TMP="$(mktemp)"
  sed "$2" "$SPEC" > "$V29_TMP"
  V29_GOT="$("$3" "$V29_TMP")"
  rm -f "$V29_TMP"
  if [ "$V29_GOT" = "$4" ]; then
    echo "FAIL V-29: the digest is blind to $1."
    exit 1
  fi
}
v29_probe 'an UNMARKED clause appended to A8' \
  's/^\(| A8 | context binding.*\) |$/\1, and the candidate is never a URL |/' \
  a8_digest "$A8_EXPECT"
v29_probe 'a second clause inserted mid-row in A8' \
  's/^\(| A8 | context binding\)/\1 (and never inside a fenced code block)/' \
  a8_digest "$A8_EXPECT"
v29_probe 'a register row reworded in M4e' \
  's/^| the \*\*keyword\*\*/| the **keyword**, and its casing,/' \
  m4e_digest "$M4E_EXPECT"

# V-18 the ratified threat model is byte-identical to the EP2-gate leg's copy.
#      Both specs carry this same expected digest over the section between
#      "## The threat model" and "## Current state". If this fails you edited a
#      ratified review criterion (ADR-0034) — revert the edit. Do NOT recompute
#      the digest to make it pass.
#      Written as a printing `if` for the reason V-11's own comment gives and
#      round 3 applied to Definition-of-done item 0: a bare `test` exits 1 in
#      SILENCE, so the loudest instruction in this step ("do NOT recompute the
#      digest") is the one an implementer never sees. The assertion and the
#      literal are unchanged, so the EP2-gate leg's copy of this digest still
#      agrees; only the diagnostic is new.
TM_DIGEST="$(awk '/^## The threat model /{f=1} /^## Current state$/{f=0} f' \
  docs/specs/WP-secret-fence-two-tier-detector.md | shasum -a 256 | cut -d' ' -f1)"
if [ "$TM_DIGEST" != "77a67f3f2d52e27ed54c1ce7ec0bc29a03280147aab0ef2813fa3f3d62503871" ]; then
  echo "FAIL V-18: the ratified threat-model section has been edited."
  echo "           got  $TM_DIGEST"
  echo "           want 77a67f3f2d52e27ed54c1ce7ec0bc29a03280147aab0ef2813fa3f3d62503871"
  echo "           That section is ADR-0034's ratified review criterion and is"
  echo "           byte-identical in both legs. REVERT YOUR EDIT. Do not"
  echo "           recompute the digest to make this pass."
  exit 1
fi

# V-33 THE SHARED CHECK CONTRACTS are byte-identical in both legs.
#      Tables H and J are stated ONCE for the epic and each leg carries its own
#      copy, because under ADR-0005 neither implementer may open the other's
#      spec. Both specs carry THIS SAME expected digest over the section between
#      "## The shared check contracts" and "## Implementation notes &
#      constraints", so an edit to either copy is caught by that leg's own suite
#      — the pattern the ratified threat-model section already uses, applied to a
#      contract instead of to a review criterion.
#      V-33 IS A DELIBERATELY SHARED ID, like V-1, V-10, V-11 and V-18: it is the
#      same check over the same bytes in both legs, which is the only condition
#      the id convention allows an id to be shared under. The allocation
#      procedure asserts exactly that set and fails on any other overlap.
#      IF THIS FAILS: a shared contract was edited. **Revert it** — or, if the
#      edit is intended, make the IDENTICAL edit in the sibling leg and recompute
#      this one literal in the same disclosed pass. Recomputing it on one side
#      alone silently un-shares the contract, which is the failure the whole
#      extraction exists to prevent.
SC_DIGEST="$(awk '/^## The shared check contracts /{f=1} /^## Implementation notes & constraints$/{f=0} f' \
  "$SPEC" | shasum -a 256 | cut -d' ' -f1)"
if [ -z "$SC_DIGEST" ] || [ "$SC_DIGEST" = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" ]; then
  echo "FAIL V-33: the shared-check-contracts section extracted EMPTY — its heading"
  echo "           or the '## Implementation notes & constraints' terminator moved."
  echo "           An empty range digests the empty string and would pin it happily."
  echo "           Do not repin. STOP AND REPORT."
  exit 1
fi
if [ "$SC_DIGEST" != "4e5fc85946d6c9b7fe2cd0440fd86795f2e3d0b8b255b2664e121dee3deceeb6" ]; then
  echo "FAIL V-33: the shared check contracts (Tables H and J) have been edited."
  echo "           got  $SC_DIGEST"
  echo "           want 4e5fc85946d6c9b7fe2cd0440fd86795f2e3d0b8b255b2664e121dee3deceeb6"
  echo "           These two tables are byte-identical in the sibling leg and the"
  echo "           registration step and the terminology sweep are DERIVED from"
  echo "           them. Revert your edit; or, if it is intended, make the same"
  echo "           edit in the sibling and recompute this literal ONCE, in both"
  echo "           legs, in the same disclosed pass. Never one side alone."
  exit 1
fi
echo "V-33 ok: the shared check contracts match the cross-leg digest"

# V-21 ADR-0034's OWN Decisions are immutable, and until round 3 nothing checked
#      them. V-11 pins that ADR's status line and signature; V-15 pins its
#      evidence; V-18 checksums the SPEC's inline copy of Decisions 1-5. None of
#      those looks at the ADR's `## Decision` sections, so an edit to a Decision
#      there was invisible to every gate in either leg — while the ADR's own
#      cross-reference block explicitly licenses ONE class of Decision-section
#      edit (a dangling cross-reference repair, five conditions, architect only).
#      A licensed exception with no gate is an unlicensed one in practice.
#      This step therefore carries TWO digests. The first covers `## Decision`
#      through the line before `## The measured evidence`, i.e. Decisions 1-7
#      entire.
#      THE SECOND COVERS THE LICENCE ITSELF (round 4). Round 4 measured that the
#      five-condition precedent — including condition 5, "the architect, and by
#      nobody else" — sat inside NO digest: the first range starts at
#      `## Decision`, and V-15's errata digest matches only lines beginning
#      `| ER-`. Deleting those six words would have widened the exception to
#      every agent with nothing going red, which is this step's own sentence
#      turned on itself. In the same pass the ADR gave that block its own `##`
#      heading, because a permanent governing rule had been parented to a
#      one-off dated "Cross-reference update" record; both edits are disclosed
#      in the ADR's "Structural correction — 2026-07-26, round 4" block with
#      their pre-edit bytes quoted verbatim, as the precedent's own conditions
#      3 and 5 require.
#      ROUND 5 REPAIRED THAT SECOND RANGE'S TERMINATOR and moved the ADR's
#      amendment bookkeeping — the errata blocks, this licence, the status note
#      and the structural corrections — into an appendix after
#      `## Alternatives considered`, so that 45.8% of the file no longer sits
#      between the reader and `## Context`. The moved bytes are unchanged and
#      their order is preserved, so the first digest above, V-15's errata digest,
#      the M1/E1 block digest and the E3 digest are all UNAFFECTED and were
#      verified byte-identical after the move. Both round-5 edits are disclosed
#      in the ADR's "Structural correction — 2026-07-26, round 5" block, again
#      with pre-edit bytes verbatim. The terminator repair is detailed just
#      below, where the range is built.
#      IF THIS FAILS: you are looking at an edited Decision. STOP and report.
#      Do NOT recompute the digest, and do NOT edit the ADR — `docs/adr/*` is
#      outside this WP's Deliverables table in both directions.
#      HONEST LIMIT, stated rather than discovered: a LEGITIMATE architect-run
#      condition-1 repair also turns this red, and the architect then recomputes
#      this literal in the same pass as the repair and its disclosure. That is
#      the intended cost — it converts a silent edit into a disclosed one.
#      THE SECOND HONEST LIMIT IS DISCHARGED. It read: "neither ADR-0034 nor
#      this spec has ever been committed, so there is NO COMMITTED BASELINE to
#      diff a Decision against and this digest is pinned to the architect's
#      working copy." Both landed in 7ef4c51 on 2026-07-26. `git show
#      7ef4c51:docs/adr/0034-accidental-persistence-threat-model.md` is now a
#      real prior state, so BOTH digests in this step are immutability checks
#      against history rather than against a working copy — which is what the
#      limit said they would become. Verified at the capture point: the ADR is
#      byte-unchanged since that commit and both literals below reproduce.
DEC_DIGEST="$(awk '/^## Decision$/{f=1} /^## The measured evidence$/{f=0} f' \
  docs/adr/0034-accidental-persistence-threat-model.md | shasum -a 256 | cut -d' ' -f1)"
if [ "$DEC_DIGEST" != "494aa6aed5203f84d0144c9ef166afb01f30c0e8be22f8f2bca495d5963c7870" ]; then
  echo "FAIL V-21: ADR-0034's Decisions 1-7 have been edited."
  echo "           got  $DEC_DIGEST"
  echo "           want 494aa6aed5203f84d0144c9ef166afb01f30c0e8be22f8f2bca495d5963c7870"
  echo "           STOP AND REPORT. Do not recompute this digest, and do not edit"
  echo "           the ADR: docs/adr/* is outside this WP's Deliverables table."
  echo "           Only the architect edits that file, only under the five-condition"
  echo "           precedent it states, and only with the recomputation disclosed."
  exit 1
fi
#      THE PRECEDENT RANGE ENDS AT THE NEXT `## ` HEADING, WHATEVER IT IS —
#      round 5, and this is not a style choice. Round 4 terminated it at the
#      NAMED heading `## Not yet committed `, which is a status note whose own
#      stated premise ("this file has never been committed") expires on the very
#      commit V-11 and Definition-of-done item 0 require before this WP may be
#      dispatched at all. Measured 2026-07-26 by deleting that section, on the
#      ROUND-4 LAYOUT this repair was raised against: the range runs
#      82 -> 567 LINES and swallows Context, all seven Decisions, the evidence,
#      the Boundary statement, Consequences and Alternatives. On the POST-MOVE
#      layout the same deletion runs it 100 -> 338 lines — smaller, because the
#      Decisions now sit above the appendix, and still a licence digest turned
#      into a whole-appendix one. Both figures are stated because the second is
#      the one an implementer could reproduce today. That
#      reddens rather than failing open — but for the wrong reason, and the
#      instructed repair ("recompute the literal") would silently convert a
#      LICENCE digest into a WHOLE-DOCUMENT digest that then reddens on every
#      legitimate evidence errata. The old probe asserted only that the range was
#      NON-EMPTY, so it could never have seen this.
#      A next-`## ` terminator cannot be deleted, because it is defined by
#      position rather than by name. `### ` subheadings do not match it. Measured
#      on the current file it selects the SAME 82 lines the named form did; the
#      82 became 100 only because round 5 also added the paragraph explaining
#      this change to the block itself, and that edit is disclosed in ADR-0034's
#      round-5 structural-correction block with its pre-edit bytes.
#      `## What this ADR supersedes and re-ratifies` was considered as a named
#      stable terminator and rejected: round 5's appendix move puts that heading
#      ABOVE this section, so it can no longer terminate anything here.
prec_range() {
  awk '/^## The five-condition precedent /{f=1; print; next} f && /^## /{f=0} f' \
    docs/adr/0034-accidental-persistence-threat-model.md
}
#      PROBE 1 — the range is non-empty. An awk range that matched nothing would
#      digest the empty string and pin it happily, which is how a renamed heading
#      turns a gate into decoration.
if [ -z "$(prec_range)" ]; then
  echo "FAIL V-21: the precedent range is empty — its heading moved or was renamed."
  echo "           Do not repin an empty range. STOP AND REPORT."
  exit 1
fi
#      PROBE 2 — and it is still CORRECTLY TERMINATED, not merely non-empty.
#      This is the check round 4 did not have, and it is the whole repair: a
#      range that has run past its own section is exactly a range containing a
#      SECOND `## ` heading.
#      WHY THE COUNT AND NOT `grep -q '^## Decision$'`, which is what the round-5
#      review asked for. The count form STRICTLY IMPLIES it — one heading in the
#      range means no other heading of any kind is in it — and the Decision form
#      alone would be VACUOUS here. Measured 2026-07-26 after round 5's appendix
#      move: `## Decision` now sits ABOVE this appendix, so even a range swollen
#      all the way to end-of-file contains 5 `## ` headings and 0 `## Decision`.
#      A probe that cannot fire against the failure it names is decoration, which
#      is the defect this document keeps finding; the count fires (1 vs 5).
if [ "$(prec_range | grep -c '^## ')" != "1" ]; then
  echo "FAIL V-21: the precedent range contains $(prec_range | grep -c '^## ') '## ' headings, not 1."
  echo "           It is no longer terminated at the end of its own section, so it is"
  echo "           digesting other sections as well. DO NOT recompute this digest:"
  echo "           repinning here would silently convert a LICENCE digest into a"
  echo "           whole-appendix one, which then reddens on every unrelated dated"
  echo "           block. STOP AND REPORT."
  exit 1
fi
PREC_DIGEST="$(prec_range | shasum -a 256 | cut -d' ' -f1)"
if [ "$PREC_DIGEST" != "57f298f2b9015d16680a3c0d8dd1943164c9019d43449ad9918569c201da81e8" ]; then
  echo "FAIL V-21: ADR-0034's five-condition precedent has been edited."
  echo "           got  $PREC_DIGEST"
  echo "           want 57f298f2b9015d16680a3c0d8dd1943164c9019d43449ad9918569c201da81e8"
  echo "           That block is the ONE licence to edit inside a Decision, and its"
  echo "           condition 5 restricts it to the architect. STOP AND REPORT."
  echo "           Same rule as above: do not recompute, do not edit the ADR."
  exit 1
fi

# V-32 THE REGISTRATION STEP — the Mirrored Surface Checklist, mechanized.
#      RATIONALE LIVES IN THE IMPLEMENTATION NOTES, under "Why the registration
#      step is DERIVED from Table H" — NOT here. Prose inside a ```bash fence is
#      invisible to a residue sweep, and Table J row J5 forbids a canonical
#      mirror living there.
#      DERIVED FROM TABLE H, THE SHARED ENUMERATOR CONTRACT. Every canonical
#      pattern — what an acceptance criterion looks like, what a verification
#      step header looks like, what an accepted-residual ordinal looks like, and
#      the boundary form a registration must match — is READ OUT OF TABLE H AT
#      RUN TIME. This step holds no second copy of any of them, which is the
#      property five rounds of hand-tuned regexes did not have. What is
#      leg-local is exactly two things: the per-table schema (Table H row H8)
#      and the dated backlog, both immediately below and both visible in a diff.
#      THE SPEC PATH IS AN ARGUMENT, NOT A LITERAL: hard-coding it means a copy
#      or a rename checks the wrong file while reporting on this one.
#      WRITTEN TO A TEMP FILE RATHER THAN `node -e`, and that is forced rather
#      than preferred: the schema keys quote this document's own headings, and
#      several contain an APOSTROPHE — an apostrophe inside `node -e '…'` closes
#      the shell string.
V32_JS="$(mktemp)"
cat >"$V32_JS" <<'REGEOF'
// ─── LEG-LOCAL: the per-table schema (Table H row H8). The set of tables is
//     DERIVED by parsing; the disposition of each is a decision, one line here,
//     visible in the diff. A table with no entry FAILS.
const SCHEMA = new Map([
["## Provenance — this is leg 1 of a two-leg split || | leg | canonical tables it owns |", ["data", "Provenance"]],
["## The measurements this design rests on || | surface | decides | warrant | enforced by |", ["data", "Four canonical numeric surfaces"]],
["## The measurements this design rests on || | token length | escapes a slash-free `{24,}` rule |", ["data", "M3"]],
["## The measurements this design rests on || | tier-2 predicate | notes quarantined |", ["data", "M4"]],
["## The measurements this design rests on || | `SEP` | `quarantine` `high-entropy` LINES in `docs/` | which |", ["data", "M4a"]],
["## The measurements this design rests on || | fixture | with `|` in `SEP` | without |", ["data", "M4a"]],
["## The measurements this design rests on || | A8 filler class | filler ≤ 20 | filler ≤ 40 |", ["data", "M4b"]],
["## The measurements this design rests on || | clause | held by | mutation |", ["data", "M4e"]],
["## The measurements this design rests on || | binder | `quarantine` `high-entropy` LINES in `docs/` | which |", ["data", "M4f"]],
["## The measurements this design rests on || | shape | today (shipped) | one-character `SEP` | A8a's token `SEP` |", ["data", "M4c"]],
["## The measurements this design rests on || | surface | one-character `SEP` | A8a's token `SEP` |", ["data", "M4c"]],
["## The measurements this design rests on || | body length | today (shipped) | tiering, no A16 rule | tiering **with** A16 |", ["data", "M4d"]],
["## Deliverables (permission boundary — touch ONLY these) || | Action | Path | Notes |", ["data", "Deliverables"]],
["## Contract reference || | Family | Canonical table | Nothing else decides it |", ["data", "Contract-reference"]],
["### Table A — canonical: the detector contract || | # | Fact | Value |", ["ids", /^A[0-9]+[a-z]?$/]],
["### A8a — the disposition of every member of gitleaks' separator group || | member | in `SEP`? | why | held by |", ["data", "A8a"]],
["#### C1 — the credential fixtures (`tests/fixtures/secret-corpus.js`) || | fixture id | construction | `/`? | labelled? |", ["data", "C1"]],
["#### C2 — the prose corpus: false positives, plus the separator controls || | # | Row | Expect |", ["data", "C2"]],
["#### C3 — the acceptance numbers || | # | Assertion | Value |", ["ids", /^C3-[0-9]+$/]],
["### Table L — canonical: the lookback arithmetic || | binding row (C3-5) | keyword | span | notes |", ["data", "Table L"]],
["### Table L — canonical: the lookback arithmetic || | holder row | keyword | span | what the span is for |", ["data", "Table L"]],
["### Table L — canonical: the lookback arithmetic || | # | fact | value |", ["ids", /^L[0-9]+$/]],
["### Completeness registers and what actually bounds each || | register | mechanism | residual hand-maintained input | claim |", ["data", "Completeness registers"]],
["### Owner signature form — canonical || | # | Fact | Value |", ["ids", /^S[0-9]+$/]],
["### Table H — canonical: what a DEFINITION is, and what a REGISTRATION is || | # | fact | pattern | why it is here |", ["ids", /^H[0-9]+$/]],
["### Table J — canonical: the check vocabularies || | # | vocabulary | members | why these |", ["ids", /^J[0-9]+$/]],
["### Mutation checks (run these; a green suite against unmodified `src/` is not evidence) || | # | One-line mutation to `src/` | Must fail |", ["ids", /^M-[0-9]+[a-z]?$/]],
]);

// ─── LEG-LOCAL: the DATED BACKLOG, a date and a reason per group. These ids are
//     NOT registered and the summary below counts them as such.
//   A4 A11 A12 A14  backlogged 2026-07-27 — Table A rows whose only other
//     surface is the "Exact contracts" block, which the Checklist registers
//     WHOLE. A11 is additionally mirrored by AC-5 and V-3, A13 by AC-6/C3-8/V-2b
//     and A14 by AC-17 and the Out-of-scope EP1/EP3/EP4 bullet — real mirrors,
//     none of those pairings written in the Checklist. Round 9 REMOVED A2, A3
//     and A13 from this list: measured under H6's boundary form they are
//     genuinely registered, and a backlog entry for a registered id is dead
//     weight that inflates the "not registered" figure.
//   S1 … S7  backlogged 2026-07-27 — the Owner-signature-form rows are
//     registered COLLECTIVELY by the Checklist bullet naming that table and
//     V-11; no row has a separate mirror set.
//   M-4  backlogged 2026-07-27 — measured, the only mutation row with no
//     citation anywhere outside its own row.
//   AC-3 AC-4 AC-5 AC-15 AC-16 AC-21  backlogged 2026-07-27, ROUND 9, and these
//     are the six the acceptance-criterion family revealed the moment Table H
//     row H2 made it visible. AC-3/AC-4 are mirrored by Table A rows A5/A6,
//     AC-5 by A10/A11, AC-21 by A16 and M-35, AC-15 by the Mutation-checks
//     preamble, AC-16 by nothing but `npm test` and `npm run lint`. Fine AS
//     BACKLOG — every one of those mirrors exists and agrees today — but they
//     are NOT registered.
//   residual 4  backlogged 2026-07-27 — cited only through A16, M4d and AC-21,
//     each of which the Checklist registers under its own id.
const BACKLOG = new Set(`
A4 A11 A12 A14
S1 S2 S3 S4 S5 S6 S7
M-4
AC-3 AC-4 AC-5 AC-15 AC-16 AC-21
`.trim().split(/\s+/).concat(["residual 4"]));
const fs = require("fs");
const file = process.argv[2];
if (!file) { console.error("FAIL V-32: no spec path was given."); process.exit(1); }
const lines = fs.readFileSync(file, "utf8").split("\n");
const flat = (s) => s.trim().replace(/\s+/g, " ");
const fail = (m) => { console.error("FAIL V-32: " + m); process.exit(1); };

// ─── DERIVED FROM TABLE H, AT RUN TIME. This step holds no second copy of any
//     canonical pattern: it reads each one out of the shared contract table and
//     fails loudly if the row or its pattern cell is gone. Change a pattern in
//     Table H and the check changes; there is nothing here to leave behind.
function hpat(id) {
  const rows = lines.filter((l) => new RegExp("^\\| " + id + " \\|").test(l));
  if (rows.length !== 1) fail("Table H row " + id + " occurs " + rows.length + " times, not once. The shared enumerator contract is missing or duplicated — restore it and re-run the shared-contract digest step before proceeding. Do NOT inline the pattern here.");
  const cell = rows[0].split("|")[3];
  const m = cell === undefined ? null : /^\s*`(.*)`\s*$/.exec(cell);
  if (!m) fail("Table H row " + id + "'s pattern cell is not a single backticked pattern: " + JSON.stringify(cell));
  return m[1];
}
hpat("H1");   // asserted present; H1 carries no pattern by design (the cell wall is the table's own structure)
const P_AC = hpat("H2");
const P_V = hpat("H3");
const P_RES = hpat("H4");
const P_BOUND = hpat("H6");
if (!P_BOUND.includes("ID")) fail("Table H row H6's pattern carries no ID placeholder, so no id can be substituted into it.");

const ra = lines.findIndex((l) => /^## Accepted residuals/.test(l));
if (ra < 0) fail("the Accepted residuals heading is missing.");
let rb = lines.findIndex((l, i) => i > ra && /^## /.test(l));
if (rb < 0) rb = lines.length;

const a = lines.findIndex((l) => /^### Mirrored Surface Checklist\s*$/.test(l));
if (a < 0) fail("the Mirrored Surface Checklist heading is missing.");
let b = lines.findIndex((l, i) => i > a && /^### /.test(l));
if (b < 0) b = lines.length;
const region = lines.slice(a, b).join("\n");
if (region.length < 2000) fail("the Checklist region is implausibly short (" + region.length + " bytes) — its terminator moved. Do not repin; report it.");
// H7: presence, against the WHITESPACE-COLLAPSED region.
const flatRegion = region.replace(/\s+/g, " ");
// H6: boundary-correct. Neither an alphanumeric neighbour nor a trailing hyphen.
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&");
const registered = (id) => new RegExp(P_BOUND.replace("ID", () => esc(id))).test(flatRegion);

// H5: a duplicate definition FAILS, in every family without exception.
const defs = new Map();
function define(id, ln, family) {
  if (defs.has(id)) fail(family + " " + id + " is DEFINED TWICE — lines " + defs.get(id).ln + " and " + ln + ". A collection that keeps only the first definition reports the duplicate as registered, because the first one is (Table H row H5).");
  defs.set(id, { ln: ln, family: family });
}

const acRe = new RegExp(P_AC);
const vRe = new RegExp(P_V);
const resRe = new RegExp(P_RES);

const seen = new Set();
let dataTables = 0;
let head = "(none)";
for (let i = 0; i < lines.length; i++) {
  if (/^#{2,6} /.test(lines[i])) head = flat(lines[i]);
  if (i + 1 < lines.length && /^\|/.test(lines[i]) && /^\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
    const key = head + " || " + flat(lines[i]);
    const s = SCHEMA.get(key);
    if (!s) fail("the table at line " + (i + 1) + " has NO schema entry (Table H row H8):\n           " + key + "\n           Every table is dispositioned ids-or-data in the commit that adds it.");
    seen.add(key);
    if (s[0] === "data") {
      dataTables += 1;
      if (!registered(s[1])) fail("the table at line " + (i + 1) + " is dispositioned as corpus/measurement DATA, so what the Checklist registers is the TABLE — but " + JSON.stringify(s[1]) + " is named nowhere in the Checklist region under H6's boundary form. Register it there, or reclassify the table. (An UNBOUNDED substring test would pass here on any longer name that contains this one: that was round 8's defect.)");
    } else {
      for (let j = i + 2; j < lines.length && /^\|/.test(lines[j]); j++) {
        const cell = (lines[j].split("|")[1] || "").trim().replace(/^\*\*|\*\*$/g, "").trim();
        if (!s[1].test(cell)) fail("row " + (j + 1) + " has first cell " + JSON.stringify(cell) + ", which its table pattern " + s[1] + " does not match. A mis-shaped id is invisible to registration (Table H row H1).");
        define(cell, j + 1, "contract-table id");
      }
    }
    continue;
  }
  const mac = acRe.exec(lines[i]);
  if (mac) define(mac[1], i + 1, "acceptance criterion");
  const mv = vRe.exec(lines[i]);
  if (mv) define(mv[1], i + 1, "verification step");
  if (i >= ra && i < rb) {
    const mr = resRe.exec(lines[i]);
    if (mr) define("residual " + mr[1], i + 1, "accepted residual");
  }
}
for (const k of SCHEMA.keys()) if (!seen.has(k)) fail("the schema names a table this document no longer contains:\n           " + k + "\n           Remove it — a stale schema entry silently widens the carve-out.");

const missing = [];
for (const [id, d] of defs) {
  if (BACKLOG.has(id)) continue;
  const hit = id.startsWith("residual ")
    ? new RegExp("residual[s]? *(\\*\\*)?" + id.slice(9) + "(?![0-9a-z])").test(flatRegion)
    : registered(id);
  if (!hit) missing.push(id + " (" + d.family + ", line " + d.ln + ")");
}
const stale = [...BACKLOG].filter((id) => !defs.has(id));
if (stale.length) fail("the dated backlog names ids this document no longer defines:\n           " + stale.join(" ") + "\n           Remove them — a stale backlog entry silently widens the carve-out.");
if (missing.length) {
  console.error("FAIL V-32: " + missing.length + " id(s) are defined by this document but appear");
  console.error("           NOWHERE in the Mirrored Surface Checklist and are not on the");
  console.error("           dated backlog:");
  for (const m of missing) console.error("           " + m);
  console.error("");
  console.error("           Register each one with its mirror set — or, if it genuinely");
  console.error("           predates the mechanization, add it to the backlog WITH a date");
  console.error("           and a reason in the same commit. Do not delete this step.");
  process.exit(1);
}
// H9: print what was checked, INCLUDING what was not. The backlog holds ids
// that are genuinely unregistered mirrors; calling them nothing would make this
// pasted artifact less honest than the source it came from.
console.log("V-32 ok: " + defs.size + " ids defined across " + seen.size + " schema-dispositioned tables (" + dataTables + " corpus/measurement, registered by table) plus the acceptance-criterion, verification-step and accepted-residual families; "
  + (defs.size - BACKLOG.size) + " registered in the Checklist under H6's boundary form; "
  + BACKLOG.size + " on the dated backlog and therefore NOT registered; 0 outside both.");
REGEOF
node "$V32_JS" "$SPEC" || { rm -f "$V32_JS"; exit 1; }
rm -f "$V32_JS"

# V-19 the glossary's GATE sentences are leg 2's and must be byte-unchanged here.
#      Exact counts for the same reason as V-15: these are byte-unchanged PINS,
#      and a stale duplicate beside an edited line satisfies `grep -q` while the
#      glossary says two things.
#      THIS IS A LEG-1-WINDOW ASSERTION AND IS NOT RE-RUNNABLE AFTER LEG 2 MERGES.
#      The `must_not` below forbids `quarantine/redacted` in the glossary; leg 2's
#      own V-22 REQUIRES it, because leg 2 is what creates that directory and
#      names it. Both are correct under the fixed ordering (detector, then gate),
#      and this step is a statement about the interim: it says leg 1 did not do
#      leg 2's edit. Anyone re-running this block on a checkout that already
#      carries leg 2 gets a FALSE RED here — that is the ordering working, not a
#      defect, and the repair is to stop re-running a merged leg's window
#      assertion, never to weaken either side.
test "$(grep -cF 'output, digest section) withhold on **any** finding of either severity; the' docs/GLOSSARY.md)" = "1"
test "$(grep -cF 'for future gates; no shipped gate branches on it today.' docs/GLOSSARY.md)" = "1"
must_not "the glossary mentions quarantine/redacted — that directory is leg 2's" \
  grep -q 'quarantine/redacted' docs/GLOSSARY.md
#      and the detector sentences arrived
grep -q 'two-tier' docs/GLOSSARY.md

# V-11  the ADR this WP implements is IN THIS CHECKOUT'S HISTORY, Accepted, and
#       signed by the owner. POSITIVE checks only: assert the presence of what
#       must exist. Never write this as "a warning is absent" — that form is
#       satisfiable by deleting the warning, which is exactly how a sibling spec
#       shipped an empty gate.
#
#       HISTORY FIRST, NOT DISK — and the reason is historical rather than
#       current. Measured 2026-07-26: ADR-0034 existed only as an UNTRACKED file
#       and had never been committed, so every on-disk form of this gate passed
#       in the architect's tree and would have failed in the implementer's.
#       IT LANDED IN 7ef4c51 ON 2026-07-26 and this check now PASSES; verified at
#       the capture point (cea31e0, 2026-07-27), together with the status line,
#       the signature and the signature digest below. The check stays because the
#       on-disk/in-history distinction is the one it exists to make, and a future
#       authority file could arrive the same way. If it ever fails, STOP — do not
#       create the file, do not commit it, do not "fix" the gate. Report it;
#       landing an ADR is the owner's call (Definition of done, item 0).
#       Written as an explicit `if` rather than a
#       bare `test` so it PRINTS: under `set -e` a bare `test -n "$(…)"` exits 1
#       in silence, and this is the first gate an implementer hits — a silent
#       non-zero here reads as a broken script, not as a blocked dispatch.
if [ -z "$(git log --format=%H -1 -- docs/adr/0034-accidental-persistence-threat-model.md)" ]; then
  echo "FAIL V-11: ADR-0034 is not in this checkout's history."
  echo "           It landed on main in 7ef4c51 on 2026-07-26, so seeing this means you are"
  echo "           on a checkout that predates it or on a branch that removed it. This WP"
  echo "           CANNOT be implemented without it. STOP and report. Do not create it, do"
  echo "           not commit it, and never write the OWNER-SIGNED line (row S5)."
  exit 1
fi
grep -qx 'Status: Accepted' docs/adr/0034-accidental-persistence-threat-model.md
#       The signature FORM is decided by the "Owner signature form" table (rows
#       S1-S7); the pattern below is derived from it and must stay derived.
#       S5 in particular: `OWNER-SIGNED` is written by the owner and nothing
#       else. Do NOT "fix" a red V-11 by adding that line yourself — a red V-11
#       means the signature is genuinely absent and the WP is not ready to
#       merge. The grep does NOT key on the `OWNER-RATIFIED IN SESSION`
#       transcription (S6): that block was written by an agent, so a gate keyed
#       on it would be satisfied by the process it exists to constrain.
#       ANCHORED AT LINE START (S2) because an unanchored grep for the bare
#       token is satisfied by this very comment; TOLERANT OF `>`/`*` decoration
#       and of any dash run (S2, S3) because a gate a human cannot satisfy
#       without typing an em-dash gets bypassed, not obeyed.
#       ONE FILE ONLY (S4): this leg's authority is the ADR. This spec carries
#       no owner signature and must not acquire one.
grep -qE '^[> *]*OWNER-SIGNED[ —–-]*[0-9]{4}-[0-9]{2}-[0-9]{2}' docs/adr/0034-accidental-persistence-threat-model.md
if grep -qE '^[> *]*OWNER-SIGNED' docs/specs/WP-secret-fence-two-tier-detector.md; then
  echo "FAIL V-11: an OWNER-SIGNED line appeared in this spec. No agent writes that line (S5),"
  echo "           and this leg needs none (S4). Remove it and report who added it."
  exit 1
fi
```

For each Mutation-check row: apply the mutation, run the named command, paste the
**failing** output, revert. A row whose suite stays green is a spec bug — say so
in the PR and stop.

## Out of scope (do NOT do these)

- **The entire EP2 gate.** `src/core/dream/validate.js`, `src/core/digest.js`,
  the `state/quarantine/redacted/` directory, the `## Redacted in place (secret
  scan)` dream-report section, the retention cap (its size is decided in that
  leg's **Table B row B12** and is deliberately not restated here), the
  `secretRedactions` counter, and `docs/runbooks/secret-incident.md` are all
  **`WP-secret-fence-ep2-redact-arm`**, which `depends_on` this WP. Doing any of
  it here is not "getting ahead" — it strands an owner-signed contract in a spec
  that was not signed for it. See "Why leg 2 cannot go first".
- **Any allowlist mechanism.** The human-ratified exact-value allowlist chain is
  superseded and already filed: `docs/specs/done/WP-secret-scan-whole-token-runs.md`,
  `docs/specs/done/WP-secret-allowlist-exact-value-store.md` and
  `docs/specs/done/WP-quarantine-review-cli.md` are `status: Superseded`, and
  `ADR-0033` is `Superseded by ADR-0034 (never ratified)` — nothing in it is in
  force. An allowlist whose size grows with the corpus is not a filter, it is a
  to-do list: the up-front approval count measured on this vault, and the share
  of it that is file paths, are stated in **ADR-0034's "Alternatives
  considered"** and are deliberately not restated here.
- **Any shape allowlist**, permanently — **ratified in ADR-0034, Decision 7**
  (Accepted 2026-07-25), which lifted the ban verbatim out of the disposed
  ADR-0033. No rule of the form "a token starting with `1` followed by 43
  base64url characters is safe" (~1 in 64 random credentials of that shape start
  with `1`), and no length, prefix, suffix, character-class or "provider-shaped
  id" variant of it. **Where this WP's rules sit relative to that line,
  explicitly:** A2/A3 change the *unit of measurement* (a delimiter-free run) and
  are symmetric — they suppress nothing and name no token as safe; A5/A8 anchor
  on *surrounding structure* (a keyword and a separator in the text around the
  token), never on the token's own characters. Neither is a suppressor keyed on a
  credential's shape.
- **URL-slot-anchored Drive-id suppression**, and **structural non-secret
  classes** generally (pure-hex 40/64, UUID shapes). Measured and dropped: the
  predecessor found URL-anchored Drive-id suppression covered **0 of 8** real
  occurrences; this vault contains **0** standalone hex-40/64 runs; and canonical
  UUIDs are already shredded because `-` is not in either alphabet. Adding rules
  for classes with zero measured occurrences is speculation.
- **trufflehog-style live verification.** See the threat model.
- **Adding the missing provider prefixes** (residual 2 — the C1 fixtures marked
  `labelled? = no`). Cheap, purely additive, and a separate WP — mixing it in
  would make this WP's FN matrix un-reviewable, because every added rule moves a
  row of C1 from the entropy pass to a labelled rule and therefore moves C3-4's
  id set. That follow-on should lead with the slash-bearing prefixes `glc_` and
  `sc_`/`ext_`/`scauth_`/`authress_`, which restore exactly what residual 1
  gives up.

  **Table A row A16 is the one exception, and the line is drawn on purpose.**
  A16 is not "a missing prefix this WP might as well add" — it is the repair of a
  hole **this WP's own tiering opens**: `Authorization: Basic` is caught today,
  and without A16 the tiering would take it to *no finding at all* 10–31% of the
  time (M4d), which is a class-(a) regression under ADR-0034's criterion. The
  rule for admitting a prefix here is therefore: **only a format the shipped
  detector catches and this change would stop catching.** Every format in
  residual 2 fails that test — they are missed today and missed after, unchanged
  by this WP — so they stay out, and the FN matrix stays reviewable because A16
  moves exactly one C1 row and that move is stated in C3-0, C3-2 and C3-4.
- **Re-tuning `ENTROPY_MIN_LEN` or `ENTROPY_MIN_BITS_PER_CHAR`.** Both stay at
  24 and 3.5. Measured alternatives (32 / 3.8 / 4.0) buy nothing once `/` is
  tiered and cost FN across every generator.
- **Editing EP1, EP3 or EP4.** No file under those gates changes. **Their
  behaviour does change, though, and this WP does not pretend otherwise** —
  `redactOnly` returns `scanAndRedact(text).text`, so EP1 and EP3 redact strictly
  less, and EP4, which keys on `findings.length > 0`, omits strictly fewer digest
  sections (A14, AC-17). That loosening is the intended consequence of A6 and is
  asserted, not assumed. What is out of scope is *editing* those call sites to
  compensate.
- **Editing `docs/adr/*`, `docs/adr/README.md`, or any other spec file.** The
  ADR this WP needs, the repointing of references after the split, and the
  disposition of the superseded specs are the architect's to file.

## Definition of done

0. **PRE-FLIGHT, before you read anything else or write a line of code:
   ADR-0034 must be in YOUR CHECKOUT'S HISTORY, not merely on disk.** Run

   ```bash
   if [ -z "$(git log --format=%H -1 -- docs/adr/0034-accidental-persistence-threat-model.md)" ]; then
     echo "STOP: ADR-0034 is not in this checkout's history. This WP cannot be"
     echo "      implemented until the owner lands it. Do not create it, do not"
     echo "      commit it, and never write the OWNER-SIGNED line (row S5)."
     exit 1
   fi
   ```

   **Written as an explicit `if`, for the reason V-11's own comment gives and
   this item used to ignore.** The earlier form here was a bare
   `test -n "$(git log …)"`; measured 2026-07-26, that exits 1 and **prints
   nothing**, so the very first instruction in this document reads as a broken
   snippet rather than as a blocked dispatch. This is byte-for-byte the check
   V-11 opens with — run either one; they are the same gate.

   **This check PASSES on today's `main`.** ADR-0034 landed in `7ef4c51` on
   2026-07-26, together with both leg files; verified at the capture point
   (`cea31e0`, 2026-07-27), as are the status line, the signature and V-11's
   signature digest. Earlier revisions of this item warned that a checkout of
   `main` would fail it — that warning was accurate when written and is now
   discharged.

   If it nevertheless fails, **stop and report** — do not implement, do not
   create the file, do not work around it. It would mean you are on a checkout
   that predates `7ef4c51` or on a branch that removed the ADR, and you would
   also see a red V-11 and a red V-15: every one of those is a gate you are
   forbidden to repair (S5 forbids any agent writing the `OWNER-SIGNED` line;
   the Deliverables table forbids touching `docs/adr/*`). **A disk check is not
   enough and that is why this survives the discharge**: an untracked file
   satisfies "exists" while leaving the authority this WP rests on out of the
   repository, which is exactly the state 2026-07-26 was in. This check is
   V-11's first line for the same reason.

   **Then the rest of V-11 passes**:
   `docs/adr/0034-accidental-persistence-threat-model.md` exists,
   its status line is literally `Status: Accepted`, and it carries an
   `OWNER-SIGNED` line **written by the owner**. The dated
   `OWNER-RATIFIED IN SESSION` blocks are transcriptions by an agent and are
   deliberately NOT what this gate keys on — they record the decision, not the
   signature. Both are positive greps — this gate asserts that something is
   present, never that a warning is absent. If it fails, **stop**: the authority
   this WP rests on is not on disk, and no amount of green tests substitutes for
   it. **This spec itself carries no `OWNER-SIGNED` line and must not acquire
   one**; V-11's last check fails the build if one appears.
1. All verification steps pass locally; output pasted into the PR body, including
   the failing output for every Mutation-check row.
2. Conventional commits; PR titled
   `fix(secret-scan): two-tier entropy candidates and contextual severity (WP-secret-fence-two-tier-detector)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR. **This does not
   redden V-15, and that took a repair to be true.** Round 1 of the design gate
   measured items 1 and 4 as *jointly unsatisfiable*: V-15 swept this document's
   own frontmatter, so the flip moved `SWEEP_EXPECT` and V-15's failure text told
   you to revert the very edit this item requires. The swept region now excludes
   the `status:` line and V-15's negative probe 2b proves the exclusion is one
   line wide. **If V-15 goes red after you flip the status and nothing else, that
   is a spec bug — say so and stop; do not recompute the literal.**
5. The PR body states the interim behaviour in one sentence, in the user's terms,
   so the reviewer can check it against "The interim behaviour" section: **the
   detector is now two-tier, EP2 is unchanged, and notes with a remaining finding
   are still reverted rather than redacted.**

**This spec stays `status: Draft`.** It moves to `Ready` only after the double
gate (`docs/runbooks/codex-review.md` plus wd-reviewer), which the orchestrator
runs. Only the architect or the owner flips it.
