---
id: WP-127
title: A5 documentation — secret-detection limits, quarantine/incident runbook, vault-local no-auto-push (audit A5)
status: Ready
model: sonnet
size: M
depends_on: [WP-122, WP-123, WP-124, WP-125, WP-126]
adrs: [ADR-0004, ADR-0024]
branch: wp/127-a5-secret-lifecycle-docs
---

# WP-127: A5 documentation — secret-detection limits, quarantine/incident runbook, vault-local no-auto-push (audit A5)

## Context (read this, nothing else)

Wienerdog is an "AI upgrade stack" that installs files: a memory **vault**, skills, hooks,
scheduled jobs. **IRON RULE (ADR-0004): Wienerdog is just files** — no daemons, no servers,
no telemetry. User-facing text is plain language for knowledge workers, not developers.

The A5 code work (WP-122..126) added the **layered secret lifecycle**: one shared
`scanAndRedact` detector; four independent, fail-closed persistence gates (pre-brain input,
staged brain output, durable log/alert/email path, per-digest-section); and private-by-default
(`0700`/`0600`) artifact modes. The audit's action **A5** (deep-dive `05-secret-lifecycle.md`,
item 9 + the "Required documentation changes") also mandates the **docs** that make the product
claims honest: secret detection is **best-effort, never the external-effect boundary**; the
vault stays **local and is not auto-pushed**; and a **secret-incident runbook** covers token
revoke/rotate plus git-history cleanup after a leaked secret is found committed.

This WP writes exactly those docs. It touches only documentation — no `src/`, no tests. It is
the final piece of **ADR-0024**, and the documentation half of A5.

Today `docs/THREAT-MODEL.md` **T4 — Credential exposure** still describes the old single pass:
"*a redaction pass strips secret-looking strings … before the dream model sees them*." That
overstates a best-effort ingest scrubber and predates the four-gate design — the audit's core
"keep every claim mechanically traceable to a gate" requirement means this text must be
corrected to the shipped mechanism and its residual.

**A5 opens NO capability gate**, and this WP changes no code, so `wienerdog safety` is
unaffected — but state it in the verification anyway.

## Current state

**`docs/THREAT-MODEL.md`** T4 (verbatim, the text to replace):

> **T4 — Credential exposure**
> **Attack**: Google tokens or API keys leak into the vault, git, or dream inputs.
> **Mitigations**: tokens live in `~/.wienerdog/secrets/` (0600), outside the vault and any git
> repo; a redaction pass strips secret-looking strings (key/token patterns) from transcript
> extracts before the dream model sees them; the vault skeleton's `.gitignore` excludes nothing
> from `secrets/` because secrets are never inside it. Trade-off accepted: file-based storage
> over OS keyring …

The **Privacy posture** section (line ~205) covers telemetry/network but does NOT state the
vault-local / no-auto-push posture. The **Residual risks** section (line ~207) lists accepted
residuals as bullets — the A5 "a scanner is never airtight" residual is not yet there.

`docs/runbooks/` holds `codex-review.md`, `release.md`, `triage.md` — the house runbook format
(a numbered, imperative checklist). There is **no** secret-incident runbook.

`README.md` and `docs/GLOSSARY.md` exist; the glossary defines `vault`, `digest`, `dreaming`,
`managed block`, etc. There is no glossary entry for the secret detector / quarantine.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | docs/THREAT-MODEL.md | rewrite T4 mitigations to the layered secret lifecycle (four gates + private modes + ADR-0024 ref); add the A5 residual bullet; add the vault-local/no-auto-push line to Privacy posture |
| create | docs/runbooks/secret-incident.md | the secret-incident runbook: stop schedules → revoke/rotate → purge digest/managed block → clean git history → re-authorize |
| modify | README.md | one short "your data stays private" note: vault is local and not auto-pushed, secret detection is best-effort, link the runbook |
| modify | docs/GLOSSARY.md | add the canonical term(s) for the shared secret detector + a secret quarantine/omission |

### Exact contracts (content the docs must state)

**1. `THREAT-MODEL.md` T4 — replace the mitigations paragraph** with a description of the
shipped mechanism (keep the tokens-in-`secrets/`-0600 and keyring-tradeoff sentences; replace
only the single-redaction-pass claim):

- Secrets in transcripts are handled by a **layered secret lifecycle** (ADR-0024): one shared
  detector (`scanAndRedact`) applied at **four independent, fail-closed points** — (i) transcript
  input before the dream brain sees it, (ii) the brain's staged output before it is committed
  (a hard finding **reverts the file**, never silently commits `[REDACTED]` prose), (iii) the
  durable log/alert/email path (the fail-loud email carries **no raw log tail**), and (iv) each
  digest section before it is injected (a section with a hard finding is **omitted**).
- The lifecycle's own artifacts (`digest.md`, `alerts.jsonl`, `transcript-ledger.json`, logs,
  scratch) are **`0600`/`0700`, independent of umask**, repaired on `sync`/`doctor` (POSIX;
  Windows relies on the per-user profile).
- **State the limit honestly**: detection is best-effort — encoded, split, or novel secrets can
  pass; name the chunk-boundary case explicitly (the per-chunk scrub of the brain's output
  stream redacts a secret split across two chunks only best-effort at the boundary — the
  WP-124 OWNER-APPROVED limitation, accepted instead of an unbounded reassembly buffer);
  **a scanner is never the external-effect boundary**. What actually contains a missed
  secret is the runtime containment (A1 — no network/Bash for the dream brain) and the send
  broker (A2 — the model cannot self-authorize an external send). Cross-reference T1/T4a.

**2. `THREAT-MODEL.md` Residual risks — add a bullet** (matching the section's tone):

> - Secret detection (A5, ADR-0024) is best-effort pattern/entropy scanning, not proof. An
>   encoded, split, or brand-new-format secret can pass all four gates; a scanner is never the
>   external-effect boundary. Accepted with defense-in-depth: four independent fail-closed gates
>   make a leak progressively less likely to become durable, private `0600`/`0700` modes limit
>   who can read a leaked artifact, and the actual containment of a missed secret is the runtime
>   profile (A1) and the send broker (A2). See the secret-incident runbook for recovery.

**3. `THREAT-MODEL.md` Privacy posture — add the vault-local / no-auto-push line** (audit A5
item 9): the **vault is local and is never auto-pushed** — Wienerdog makes one local git commit
per dream run and never configures a remote or pushes; publishing the vault is an explicit user
action. This is why a committed secret stays on the machine until the user chooses otherwise
(and why the incident runbook's git-history cleanup is local).

**4. `docs/runbooks/secret-incident.md` — a new runbook** in the house format (numbered
imperative checklist, plain language). It must cover, in order:
1. **Stop the schedules first** — `wienerdog schedule remove …` (or disable) so no further dream
   run reads/commits/injects while you clean up (mirrors the A9 "stop all jobs before rotation"
   principle; A5 scopes the secret case).
2. **Revoke + rotate the leaked credential** at the provider (Google/OpenAI/AWS/GitHub/Stripe
   as applicable) — revoke first, then issue a new one; a rotated-but-not-revoked key is still
   live.
3. **Purge the injected copies** — remove the compromised `digest.md` and any managed block that
   carried the secret (`wienerdog sync` re-renders a clean digest once the source note is fixed;
   or delete `state/digest.md` and re-sync), and fix/quarantine the source note.
   **Also review and purge `state/quarantine/`** (the staged-output secret quarantine,
   WP-123): a true-positive quarantined file holds the raw secret bytes — delete it after
   rotation; a false positive can be manually restored into the vault instead.
4. **Clean git history** — the vault is a local git repo; a committed secret is in history, not
   just the working tree. Give the concrete commands (`git filter-repo` or the BFG, or
   `git rebase`/`git commit --amend` for a recent single commit) to remove the blob, and note
   that this rewrites history (safe because the vault is local/not-pushed by default; if the
   user DID push a fork, they must force-push and treat the key as compromised regardless).
5. **Re-authorize** — only after 1–4, re-enable the schedule; confirm the new digest is clean
   and the rotated credential works (`wienerdog doctor`).

**5. `README.md` — one short note** (a paragraph or a bullet under an existing privacy/how-it-
works section, not a new top-level section): your vault stays **on your machine** and is not
auto-pushed anywhere; Wienerdog scrubs secret-looking strings from what the dreaming job reads
and writes, but that scrubbing is **best-effort** — if you know a real credential was captured,
follow the secret-incident runbook (link it). Keep it plain-language, no jargon.

**6. `docs/GLOSSARY.md` — add the canonical term(s)** so future specs/docs use one name:

> - **secret scan / `scanAndRedact`** — the single shared detector (`src/core/secret-scan.js`)
>   that returns sanitized text plus metadata-only findings, applied at four fail-closed
>   persistence points (ADR-0024). A **hard finding** (quarantine severity) causes the whole
>   artifact to be withheld/reverted/omitted — never a silent `[REDACTED]` rewrite. (Not:
>   "filter", "scrubber", "DLP".)

## Implementation notes & constraints

- **This is the documentation half of ADR-0024 / A5.** Every claim must be mechanically
  traceable to a shipped gate (WP-122..126) — do not describe a capability that is not in code.
- **Keep every existing correct claim.** In T4, retain the tokens-in-`secrets/`-0600 and
  file-storage-vs-keyring tradeoff sentences; replace ONLY the single-redaction-pass sentence.
- **Plain language.** The README note and the runbook are for a knowledge worker; explain
  "rotate", "revoke", and "git history" in one clause each. The THREAT-MODEL text may be more
  technical (its audience is a reviewer).
- **No overclaiming.** State the residual plainly ("a scanner is never airtight; A1/A2 contain a
  miss"). Do not imply the four gates make leakage impossible.
- **No code, no tests.** This WP is docs-only; the Deliverables table is exhaustive. Do not
  edit `src/` or `tests/` (CI rejects unlisted touches).
- Markdown must pass the lint pipeline (markdownlint + frontmatter checks over docs). When
  uncertain, choose simpler + record it.

## Acceptance criteria

- [ ] `THREAT-MODEL.md` T4 no longer claims a single redaction pass; it describes the four
      fail-closed gates + private modes + the "scanner is never the external-effect boundary"
      residual, and references ADR-0024.
- [ ] `THREAT-MODEL.md` Residual risks has the A5 best-effort-detection bullet; Privacy posture
      states the vault is local and not auto-pushed.
- [ ] `docs/runbooks/secret-incident.md` exists and covers, in order: stop schedules → revoke +
      rotate → purge digest/managed block → clean git history → re-authorize, with concrete
      commands, in the house runbook format.
- [ ] `README.md` states the vault stays local / not auto-pushed and that secret scrubbing is
      best-effort, and links the runbook — in plain language.
- [ ] `docs/GLOSSARY.md` defines the shared secret detector / quarantine term.
- [ ] Every documented behavior maps to a shipped WP-122..126 mechanism (no overclaim).
- [ ] `npm run lint` passes (docs lint layers); `wienerdog safety` still shows all five gates
      BLOCKED (unchanged — no code touched).

## Verification steps (run these; paste output in the PR)

```bash
npm run lint
node bin/wienerdog.js safety   # all five gates BLOCKED (no code changed)
grep -n "redaction pass strips" docs/THREAT-MODEL.md || echo "old single-pass claim removed — OK"
test -f docs/runbooks/secret-incident.md && echo "runbook present — OK"
```

## Out of scope (do NOT do these)

- Any `src/` or `tests/` change — the A5 code is WP-122..126; this WP is docs-only.
- The broader **incident drill / log-rotation / full mechanics-root privacy policy** — **A9**
  (this runbook is the *secret-leak* case; A9 owns the general incident runbook).
- Documenting A1/A2 mechanisms themselves — this WP only cross-references them as the
  external-effect boundary; their docs land with A1/A2.
- Marketing/article copy — the docs series is a separate wd-docs track.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/127-a5-secret-lifecycle-docs`; conventional commits; PR titled
   `docs(security): A5 secret-lifecycle threat model + secret-incident runbook (WP-127)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.

> **Fork note:** work lands directly on `main` per WORKING-NOTES.md; `branch:`/PR fields are
> kept for template/upstream-porting fidelity.
