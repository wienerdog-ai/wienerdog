# ADR-0033: Human-ratified exact-value secret allowlist

Status: Superseded by ADR-0034 (never ratified)
Date: 2026-07-25

> **SUPERSEDED — 2026-07-25, the same day it was drafted. NOTHING IN THIS
> DOCUMENT IS IN FORCE.** This ADR was never ratified: it carried an empty
> approval block, it was never accepted, and the design it proposes — a
> human-ratified exact-value allowlist of `sha256` digests, with its
> `WP-secret-scan-whole-token-runs` → `WP-secret-allowlist-exact-value-store` →
> `WP-quarantine-review-cli` chain — **will not be built.** It is retained as
> the record of what was considered, not as a decision.
>
> **Why it was dropped.** It solves the wrong problem. It treats the recurring
> false positives as a set of individually blessable values, but measured
> against the real vault they are a **rule defect**: 100% of the destructive
> false positives come from one context-free entropy rule, and approving them
> one at a time would have required **~118 manual approvals up front, 97% of
> them file paths**, growing with every new project folder. An allowlist whose
> size grows with the corpus is not a filter, it is a to-do list. The
> replacement is **ADR-0034** (threat model) implemented by
> `WP-secret-fence-two-tier-detector` + `WP-secret-fence-ep2-redact-arm`, which fixes the rule instead.
>
> **What survived.** Exactly one thing: the **permanent shape-allowlist ban**
> in "Alternatives considered" below. It is lifted verbatim into **ADR-0034,
> Decision 7**, and ratified there. Cite ADR-0034 for it, never this file.
>
> Do not implement anything below. Do not cite anything below as authority.

## Context

ADR-0024 makes secret handling fail-closed: one shared detector
(`src/core/secret-scan.js`), four independent persistence gates, and — at the two
gates that cannot safely rewrite an artifact (EP2 staged brain output, EP4 digest
sections) — **any** finding withholds the **whole** artifact. Behind eighteen
precise labelled provider rules sits one **context-free high-entropy pass**: a
long enough, random enough run of characters is `high-entropy` at `quarantine`
severity.

A high-entropy run is a *shape*, not a fact about provenance. The user's own
prose legitimately contains such runs — a Google Drive file id is 33 or 44
base64url characters at 4.68–4.79 bits/char and is **indistinguishable from a
credential by shape alone**. On **2026-07-24** and again on **2026-07-25** the
live EP2 gate reverted three notes each night on the maintainer's machine; one of
them, a 43 737-byte state note, contains a permanent Drive id in its body, so
**every** consolidation that touches it is reverted, indefinitely. The 07-24
daily rollup was lost outright (the transcripts had already been marked processed
— fixed separately by `WP-secret-revert-defers-ledger`); the 07-25 notes had to be
restored by hand out of `state/quarantine/`.

Two shape-level remedies were measured against the real vault and **both fail**:

- **Allowlisting the shape** `1` + 43 base64url characters (the Drive-id shape).
  Roughly **1 in 64** uniformly random 44-character base64url credentials begins
  with `1`, so this rule would silently wave through about 1.6% of real
  credentials of that length. It is a fail-open hole in a fail-closed gate.
- **Suppression anchored to an exact Drive/Docs URL slot**
  (`drive.google.com/…/d/<id>`, `?id=<id>`). Measured: **0 of 8** real
  occurrences in the vault sit in a URL slot (all eight are bare backticked ids
  in Hungarian prose), while an adversary planting a secret *inside* the allowed
  slot would be detected **0.00%** of the time (N = 20 000). Zero benefit, real
  cost.

So the recurring false positive cannot be fixed by making the detector smarter
about *shapes*. What is actually available is a fact the detector can never
derive and the human always can: **"this exact value is not a secret."**

**IRON RULE (ADR-0004): Wienerdog is just files.** This decision adds one 0600
JSON file and CLI verbs; no process, no daemon, no telemetry leaving the machine.

## Decision

Introduce a **human-ratified, exact-value secret allowlist**: a code-owned 0600
registry of `sha256` digests of specific values a human has personally reviewed
and permanently approved. The fence itself is not softened; individual, named
values are exempted from it, one at a time, by a person.

1. **Entries are digests of a whole matched span, never the raw value.** The key
   is `sha256` over the exact UTF-8 bytes of one **maximal detector run** (the
   whole delimiter-bounded token the entropy pass matched), hex, lowercase. Two
   independent reasons, both binding:
   - a file full of raw high-entropy strings would **trip the scanner itself**
     and would leak those values onward into digests, logs and quarantine
     reasons — the store would become the leak it exists to avoid;
   - a whole-span digest is **structurally incapable** of degenerating into the
     rejected shape rule. There is no glob, no prefix, no suffix, no length, no
     character class — only whole-value equality. Any future proposal to store
     anything but a full-span digest is rejected by this ADR.
2. **Suppression is scoped by containment, exactly like the canonical-UUID
   suppressor.** A span lying wholly inside an approved run is not a candidate
   either; otherwise approving a value would leave its own sub-spans firing and
   approval would not work. The approved unit is the whole token, byte-exact.
3. **The allowlist may only ever suppress a `high-entropy` finding.** It may
   never suppress a labelled provider match — private-key block, `sk-ant-`,
   `sk-proj-`, `sk-`, `AKIA`, `gh[pousr]_`, `xox`, `ya29.`, JWT, bearer header,
   sensitive assignment, `GOCSPX-`, `1//0`, `AIza`, `sk_live_`, `rk_live_`,
   `pk_live_`, or any rule added later. This is enforced twice:
   - **structurally** — the labelled rules run *before* the entropy pass and
     replace their matches with `[REDACTED:<label>]`, so a recognisable
     credential can never reach the entropy pass as a candidate span at all;
   - **explicitly** — the store refuses to record any span whose own scan
     produces anything other than exactly one finding labelled `high-entropy`.
     The refusal lives in the store, not in the CLI, so it holds for every
     future caller.
4. **Human-only writes, at a real terminal.** The allowlist is written by one
   interactive CLI path with a typed-word confirmation read from a controlling
   terminal, with **no** `--yes`, no environment bypass, and no headless mode —
   the `wienerdog grant` / `wienerdog memory approve` model (ADR-0007,
   ADR-0021). **The dream never writes it. `sync` never seeds it. No skill,
   hook, or scheduled job writes it.** A model may *guide* the review session;
   the write is a deterministic command the human runs, because model output is
   untrusted in this threat model.
   This is not a stylistic preference. ADR-0021 Amendment 1 records the P0 this
   avoids: `seedApprovals` auto-trusted **any** unrecorded identity file on every
   `sync`, with no TTY and no bytes shown. That was only ever safe because the
   WP-112 freeze guaranteed the dream could not author those files; the moment
   the freeze lifted, "trust what is on disk" became "trust what the dream
   wrote." An allowlist that any unattended path can extend has the same shape
   and must not be built.
5. **An entry may only be created from a value physically present in
   `state/quarantine/` at approve time.** Review is retroactive: the human looks
   at what the gate actually withheld and approves specific values out of it.
   There is no way to pre-approve an arbitrary string, and the raw value is never
   passed as a command-line argument (that would put it in shell history) — the
   human selects a candidate by its displayed digest prefix.
6. **Suppression is detector-wide, not gate-only.** An approved value stops
   being flagged everywhere the one shared detector runs: EP2, EP4, and also the
   `redactOnly` sinks — alerts, run evidence, the brain's stdout/stderr log, the
   transcript pre-brain pass, and routine logs. **Consequence, stated plainly:
   an approved value will appear verbatim in those durable local artifacts
   instead of as `[REDACTED:high-entropy]`.** This is the owner's explicit
   choice over a gate-only allowlist, on ADR-0024's own one-shared-detector
   premise: divergence between gates is its own bug class, and a value the human
   has ratified as "not a secret" that is nevertheless redacted from the logs the
   human debugs with is a second, quieter failure.
7. **Placement and lifecycle.** `~/.wienerdog/state/secret-allowlist.json`,
   mode 0600 inside the 0700 `state/` dir, written atomically
   (temp + rename + chmod), read fail-closed: missing, unreadable, or malformed
   → an **empty** set, so a damaged store suppresses nothing. It lives where the
   other private trust state lives and is therefore reversed by `wienerdog
   uninstall` through `disposeCoreMechanics`, which removes `state/` wholesale
   (ADR-0019) — it needs **no** install-manifest entry, exactly like
   `identity-approvals.json` and `transcript-ledger.json`.
8. **Same shape family as the identity trust registry (ADR-0021), separate
   file.** Same 0600 + atomic-write + fail-closed-empty + TTY-only-mutation
   shape, deliberately mirrored so there is one recognisable idiom for
   human-ratified trust state. But a **separate file**, because the two have
   different key spaces (a vault-relative path vs a content digest), different
   cardinality (exactly four slots vs an open set), and different lifecycles
   (ratify-the-current-bytes vs append-and-remove, with no seeding at all). One
   file with two authorities is the "two overlapping state models" mistake
   ADR-0023 rejected.
9. **Every entry carries an audit trail and is easy to remove.** Per entry: the
   digest, a human-written label/provenance note, and the approval timestamp.
   Removal is a first-class command, not a file edit. A read-only review view
   lists what is currently withheld and which approved values still recur, so
   the owner can see how often false positives happen and revisit posture — all
   derived at read time from files already on disk; nothing is accumulated and
   nothing leaves the machine.

## Boundary statement

This makes it **impossible to approve a credential Wienerdog recognises**. It
does **not** make it impossible to approve a real credential Wienerdog does not
recognise — an unknown provider's opaque token looks exactly like a Drive id, and
a human who approves one has disabled detection for that exact value everywhere,
permanently, until they remove it. The residual is accepted deliberately: the
alternative on offer was a shape rule that waives ~1 in 64 credentials with no
human in the loop at all.

Like ADR-0021, this is **not** an OS security boundary. Same-UID native code can
rewrite the allowlist as easily as it can rewrite the identity registry
(`docs/THREAT-MODEL.md` T0). It is a human-ratification and drift-evidence
mechanism.

## Consequences

- A recurring, correctly-identified false positive can be retired permanently by
  the person who knows it is benign, without weakening the fence for anyone else
  and without a single new shape rule in the detector.
- The detector gains one suppressor rung above every existing rung, and one
  process-scoped input (the approved digest set, installed once per CLI
  invocation). Absent that install — a direct module import, a test — the set is
  empty and behaviour is exactly as before. Fail closed by default.
- `WP-secret-fence-shape-and-context`'s out-of-scope bullets ("no allowlist
  mechanism", "do NOT add a sixth rung") scope **that** work package, which
  ships the ladder without one. This ADR authorises the later addition; the two
  are sequential, not contradictory.
- An approved value is no longer redacted in `alerts.jsonl`, run evidence, the
  per-run brain log, routine logs, or the pre-brain transcript pass. Decision 6.
- Approving a value is the only supported way to stop a recurring benign
  quarantine. Nothing auto-approves, so a user who never runs the review command
  keeps the fail-closed behaviour they have today.

## Alternatives considered

- **A shape allowlist (`1` + 43 base64url characters).** Rejected **permanently**
  (owner direction, 2026-07-25): ~1 in 64 uniformly random 44-character
  base64url credentials start with `1`, so the rule is a standing fail-open hole
  with no human in the loop. Do not re-propose it in any form — a length rule, a
  prefix rule, a character-class rule and a "provider-shaped id" rule are the
  same rejected thing.
- **URL-slot-anchored suppression.** Measured and rejected: 0 of 8 real
  occurrences covered, 0.00% adversarial detection retained inside the allowed
  slot.
- **Gate-only suppression (EP2/EP4 only, keep redacting in logs).** Rejected by
  the owner: it forks the behaviour of the one shared detector, which ADR-0024
  exists to prevent, and it leaves the human debugging redacted copies of a
  value they personally declared benign.
- **Storing the raw approved values.** Rejected: the store would itself be a
  high-entropy secret file that the scanner flags, and its contents would flow
  into any surface that reports on it.
- **Prefix / substring / regex entries.** Rejected: every one of them is a shape
  rule with extra steps, and each re-opens the fail-open class this ADR closes.
- **Folding the entries into `state/identity-approvals.json`.** Rejected:
  different key space, cardinality and lifecycle; one file with two authorities.
- **Auto-approving a value the user has restored from `state/quarantine/` by
  hand.** Rejected: it turns a filesystem action into a trust decision with no
  confirmation and no audit record — the `seedApprovals` mistake again.
- **Lowering `high-entropy` from `quarantine` to `redact`.** Rejected by
  ADR-0024 already, and it would change nothing: both withholding gates trigger
  on `findings.length > 0` regardless of severity.
