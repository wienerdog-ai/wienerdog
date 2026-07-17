# Wienerdog Security Audit — Secrets, Credentials & Transcript Redaction

> **Consensus status (2026-07-15): confirmed, with a stronger remediation
> requirement.** Expanding regex coverage is necessary hygiene but can never be
> the sole credential boundary: encoded, split, novel, and unknown-provider
> secrets remain possible. The required design is bounded pre-processing plus
> layered detection, exact matching of Wienerdog-known credentials, and a
> fail-closed pre-commit/pre-digest quarantine that restores the last known-good
> artifact and alerts the user. A second silent redaction pass is insufficient
> because it can mutate meaning and hide the incident. The private vault and
> runtime capability fence remain independent containment layers. The F5 phrase
> "world-readable" is the common `umask 022` outcome, not an unconditional mode;
> the source-confirmed defect is that Wienerdog does not guarantee or repair
> private modes. Likewise, a Google refresh-token fix must not hard-code only
> `1//0...`: provider formats vary, so structured `refresh_token` key detection
> and lifecycle gates matter more than one prefix regex.

**Dimension:** Secrets / credentials leakage and transcript redaction completeness
**Date:** 2026-07-15
**Scope:** `src/core/transcripts/*`, `src/core/dream/*`, `src/gws/*`, `src/core/paths.js`, `src/core/digest.js`, `src/core/alerts.js`, `src/cli/dream.js`, `src/cli/run-job.js`, `docs/THREAT-MODEL.md`
**Method:** Read the real code paths end to end (parse → redact → cap → scratch → brain → validate → commit → digest), traced the OAuth/token storage flow, analyzed the redaction regex table for coverage/evasion/ReDoS, scanned tracked files for committed secrets.

---

## Executive summary

The **token-at-rest and OAuth-flow handling is genuinely strong** (0700/0600, atomic write + re-chmod, PKCE S256, state-verified loopback, no lingering sockets, no committed secrets). The **weak point is the redaction pass** in `src/core/transcripts/index.js`: it is a shape-based regex allowlist that (1) misses several extremely common secret shapes — including the exact Google **refresh-token** format Wienerdog itself stores, and the dominant `PREFIX_SECRET=` / `ACCESS_TOKEN=` env-var naming — and (2) is the **sole** line of defense for a chain that ends in a **git-committed vault note and an injected `CLAUDE.md` digest**. A single missed secret is not just briefly exposed to the model; it can become a permanent, committed artifact. Secondary issue: `state/`, `dream-scratch/`, `logs/`, `digest.md` are created **world-readable (0755/0644)**, inconsistent with the 0600 treatment of `secrets/`.

---

## Findings (most severe first)

### F1 — Generic `key=value` redaction fails for underscore-compound secret names
**Severity:** HIGH **Confidence:** high
**Location:** `src/core/transcripts/index.js:35-38`

```js
[/\b(api[_-]?key|secret|token|password|passwd|bearer)(["']?\s*[:=]\s*["']?)[A-Za-z0-9_\-]{12,}/gi,
 (_m, key, sep) => `${key}${sep}[REDACTED:generic-secret]`],
```

The alternation is anchored with a leading `\b`. Because `_` is a **word character** in JS regex (`\w` = `[A-Za-z0-9_]`), there is **no word boundary between an underscore and the following letter**. Therefore the "catch-all" value redactor never fires for the most common real-world env-var shapes:

- `CLIENT_SECRET=abcd1234efgh` — `\bsecret` fails after `_` → **not redacted**
- `ACCESS_TOKEN=...`, `GITHUB_TOKEN=...`, `SLACK_TOKEN=...` — `\btoken` fails after `_` → **not redacted**
- `DB_PASSWORD=...`, `DATABASE_PASSWORD=...` — `\bpassword` fails after `_` → **not redacted**
- `refresh_token=...`, `refresh_token: ...` — **not redacted**
- `AWS_SECRET_ACCESS_KEY=...` — neither `secret` (after `_`) nor `api_key` (no `api`) matches → **not redacted**

Only the standalone lowercase forms (`password=`, `token=`, `secret=` at a real boundary) and `api_key`/`apikey`/`api-key` are caught. This is the single broadest gap: `.env` dumps, `printenv`, and pasted config — the most likely way a secret enters a transcript — predominantly use `UPPER_SNAKE` names that slip straight through the generic net.

**Leak scenario:** User pastes a `.env` file or `env | grep` output into a Claude/Codex session (`STRIPE_WEBHOOK_SECRET=whsec_...`, `DATABASE_URL=postgres://user:pass@host`). The value has no provider-recognizable prefix, so no dedicated pattern catches it either. It is written verbatim into the scratch extract, fed to the dream brain, and can be copied by the brain into a vault memory note → committed to the vault git repo → surfaced in the digest → injected into `CLAUDE.md`.
**Exploitable or mitigated:** Exploitable with entirely normal, non-adversarial content. Unmitigated.

---

### F2 — Google refresh-token format (`1//...`) is not redacted at all
**Severity:** HIGH **Confidence:** high
**Location:** `src/core/transcripts/index.js:30` (only `ya29.` is covered)

```js
[/\bya29\.[A-Za-z0-9\-_]+/g, '[REDACTED:google-oauth]'],
```

The table redacts Google **access** tokens (`ya29.…`, short-lived, ~1h) but has **no pattern for Google refresh tokens**, whose canonical shape is `1//0g…` / `1//03…` (long-lived, the credential that actually grants standing access). This is precisely the secret Wienerdog persists at `~/.wienerdog/secrets/google-token.json` (`persistToken`, `src/gws/client.js:112`).

**Leak scenario:** The user (or the model, or a `doctor`/debug step) `cat`s `~/.wienerdog/secrets/google-token.json` inside a Claude Code session while troubleshooting Google connectivity — a very plausible action given Wienerdog *is* a Google-Workspace tool. The JSON contains `"refresh_token": "1//0g..."`. The `refresh_token` **key** also evades F1 (underscore boundary), and the **value** matches no dedicated pattern. The long-lived Google refresh token is written to scratch, shown to the dream brain, and can be persisted into a committed vault note / the digest. An attacker with read access to the vault git history or the injected `CLAUDE.md` obtains durable Google Workspace access (Gmail read/compose, Calendar, Drive read — the consented `SCOPES`).
**Exploitable or mitigated:** Exploitable. Unmitigated. Highest-value target in the system, self-inflicted by the product's own domain.

---

### F3 — Redaction is the sole defense and runs only pre-brain; the write/commit/digest path never re-redacts
**Severity:** HIGH **Confidence:** high
**Location:** `src/core/dream/scratch.js:29-30` ("Redaction already ran in parse(), so no re-redaction is needed here"), `src/cli/dream.js:264-285` (validate + commit + digest), `src/core/digest.js` (no redaction anywhere)

Redaction happens exactly once, in `capMessage()` → `parse()` (`transcripts/index.js:80-88`), on the way *into* scratch. After that:

- The dream brain reads scratch and **writes markdown notes into the vault** (`buildClaudeArgs`, write target = vault).
- `validateAndCommit` (`dream.js:266`) **git-commits** the vault. The validator checks *where* the brain wrote (in-vault vs out-of-vault) and reverts out-of-vault writes, but it does **not** scan note *content* for secrets.
- `renderDigest` (`digest.js:240`) reads identity notes + newest daily `## Summary` + project dir names and injects them into `CLAUDE.md`/`AGENTS.md`. It honors a `derived_from_untrusted: true` frontmatter gate but performs **no redaction**.

Consequence: whatever F1/F2/F4/F6 let through is not merely shown to the model transiently — it can be promoted by the brain into a **permanent, git-committed vault note** and, if it lands in `profile/preferences/goals/instructions.md` or a daily `## Summary`, into the **`CLAUDE.md` managed block** (which for many users lives in a git repo). The threat model (`docs/THREAT-MODEL.md:73`) asserts "a redaction pass strips secret-looking strings … before the dream model sees them" as *the* mitigation — so the entire secrets-in-vault control rests on the completeness of the one regex table, with no defense in depth at the write or commit boundary.
**Exploitable or mitigated:** Partially mitigated only by the redaction pass itself; given F1/F2 that mitigation is porous. A content-level secret scan at the commit gate (reuse the exported `redact()` on staged note bodies) would close it.

---

### F4 — Modern provider key formats slip the dedicated patterns
**Severity:** MEDIUM **Confidence:** high
**Location:** `src/core/transcripts/index.js:26-28`

- **OpenAI project/service keys** — `sk-proj-…`, `sk-svcacct-…`. The rule `\bsk-[A-Za-z0-9]{20,}\b` (line 26) requires 20+ **alphanumeric** chars immediately after `sk-`; `sk-proj-` breaks at the hyphen after only 4 chars, so current-format OpenAI keys are **not** redacted. (`sk-ant-…` is saved only because it has its own dedicated line 25.)
- **GitHub fine-grained PATs** — `github_pat_11ABC…`. Line 28 matches only `gh[pousr]_…` (`ghp_/gho_/ghu_/ghs_/ghr_`); `github_pat_` is not covered.
- **Google API keys** — `AIzaSy…` (39 chars). No pattern at all.
- **Stripe** — `sk_live_…`, `rk_live_…`. `sk_` (underscore) is not `sk-`; no pattern matches; the key name `STRIPE_SECRET_KEY` also evades F1.

**Leak scenario:** Any of these appearing in a tool_result (e.g. a `cat .env`, a curl with an API key, a stack trace) flows unredacted into scratch → brain → possible vault/digest commit (see F3).
**Exploitable or mitigated:** Exploitable with normal content; unmitigated for the listed formats.

---

### F5 — `state/`, `dream-scratch/`, `logs/`, `digest.md`, `alerts.jsonl` are world-readable
**Severity:** MEDIUM **Confidence:** high
**Location:** `src/core/dream/scratch.js:174` (`mkdirSync(scratchDir, {recursive:true})` — no mode), `:180` (`writeFileSync(scratchFile, …)` — no mode); `src/cli/dream.js:230-231` (log dir + `createWriteStream` — no mode), `:283-285` (`digest.md` temp write — no mode); `src/cli/init.js:129` (`state`/`logs` created with `mode: … : undefined`); `src/core/alerts.js:38-39,70` (alerts.jsonl)

Only `secrets/` is hardened (0700 dir, 0600 files — see Solid Handling). Everything else under `~/.wienerdog/` is created with the process default (dirs `0777 & ~umask` ≈ 0755, files `0666 & ~umask` ≈ 0644). That includes:

- `state/dream-scratch/*.json` — the **normalized transcript extracts** (post-redaction, but exactly the content a redaction miss would expose). World-readable for the whole dream run window (minutes); `rm -rf`'d only in the `finally` of `dream.run()` and at the start of the next `collectExtracts`.
- `logs/dream/YYYY-MM-DD.log` and `logs/<job>/*.log` — brain stdout/stderr (see F9). **Persistent** (daily log is explicitly never rotated, `run-job.js:236-238`).
- `state/digest.md` — the identity/memory summary injected into `CLAUDE.md`.
- `state/alerts.jsonl` — job-status facts (see Solid Handling — content is bounded).

**Leak scenario:** On a shared/multi-user host, any other local UID can read the user's transcript-derived extracts, dream logs, and digest — and, if any redaction gap (F1/F2/F4/F6) fired, the plaintext secret sitting in scratch/log/digest. This is inconsistent with the 0600 stance the threat model takes for `secrets/`.
**Exploitable or mitigated:** Requires a multi-user machine; the stated trust model is single-user (`THREAT-MODEL.md:81` "single-user-machine trust model"), so partially accepted — but the asymmetry (secrets 0600, their redaction-failure spillover 0644) is worth closing by creating these dirs 0700 / files 0600.

---

### F6 — `\b` anchoring and whitespace-sensitivity make the shape patterns trivially evadable
**Severity:** MEDIUM **Confidence:** high
**Location:** `src/core/transcripts/index.js:24-37` (all `\b`-anchored rows)

Because every provider pattern is anchored with `\b` and matches a contiguous run, an adversary who controls transcript content (e.g. injected tool output, a malicious repo file the user pastes, a web page a tool fetched) can defeat redaction:

- **Glue to a preceding word char:** `Xya29.a0AfB…`, `zsk-ant-abc…`, `0ghp_…` — the leading `\b` fails (previous char is a word char), so the token is **not** matched even though a human reads it as a secret.
- **Whitespace/line wrapping:** a token printed 4 chars per line, or with spaces inserted, matches nothing.
- **Encoding:** base64/hex-wrapped or reversed secrets match nothing (inherent to shape-based redaction).

**Leak scenario:** Prompt-injection / poisoned content deliberately formats an exfiltration-target secret to survive redaction, then relies on the brain to copy it into a committed note or the digest (F3). Even without an attacker, natural formatting (a JSON blob where the token abuts a quote-less delimiter, or a wrapped log line) can bypass it.
**Exploitable or mitigated:** Exploitable; inherent limitation of allowlist-shape redaction. Not mitigated. Worth documenting as an explicit residual and pairing with F3's commit-gate scan.

---

### F7 — Non-message extract fields (`source_path`, `cwd`, `session_id`) are never redacted
**Severity:** LOW **Confidence:** high
**Location:** redaction runs only on `message.text` in `capMessage` (`transcripts/index.js:81`); `source_path`/`cwd`/`session_id` are copied verbatim (`claude.js:104,161,171`; `codex.js:150-152,171`) into the extract JSON written to scratch and shown to the brain.

**Leak scenario:** A working directory or file path that itself embeds a secret (e.g. a pre-signed URL saved as a filename, `cwd` under a directory named after a token) reaches the brain and scratch unredacted. Low likelihood but zero coverage.
**Exploitable or mitigated:** Low real-world likelihood; unmitigated.

---

### F8 — AWS secret-access-key values are only partially redacted
**Severity:** LOW **Confidence:** medium
**Location:** `src/core/transcripts/index.js:36` value class `[A-Za-z0-9_\-]{12,}`

Even when the key *name* matches (e.g. lowercase `secret=...`), the value character class excludes `/` and `+`, which appear in base64 secrets such as AWS secret access keys (`wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`). The match stops at the first `/`, redacting only the prefix and leaving the remainder in cleartext. `AKIA…` access-key *IDs* are fully caught (line 27), but the paired secret value is not.
**Exploitable or mitigated:** Partially mitigated (prefix redacted); tail leaks. Compounded by F1 for the common `AWS_SECRET_ACCESS_KEY` name.

---

### F9 — Brain stdout/stderr is persisted world-readable and the tail is emailed
**Severity:** LOW **Confidence:** medium
**Location:** `src/cli/dream.js:231` (daily log, append, never rotated), `src/cli/run-job.js:495-496` (tee child stdout+stderr to per-run log), `:549` + `failLoud`/`defaultSendAlert` (`:282-290`) — last 2KB (`LOG_TAIL_BYTES`) emailed via `gws _alert`.

The dream brain's stdout in `claude -p` mode is its final assistant text; stderr may include diagnostics. Neither is re-redacted. If the brain quotes a redaction-missed secret from an extract in its summary/output, or a stack trace surfaces input bytes, that content lands in a **persistent, world-readable** log (F5) and its tail is emailed to the user's own inbox.
**Note (positive):** The **durable alert** stored in `alerts.jsonl` and rendered into the digest uses only `reason` (e.g. `job "dream" exited 1`), **not** the log tail — so the high-value *digest → CLAUDE.md* channel does **not** carry brain output. The tail leaks only to the log file and the self-addressed email.
**Exploitable or mitigated:** Mostly mitigated for the digest path; residual is log-file (local read) + self-email. Low.

---

### F10 — Redaction regex ReDoS risk is low (informational)
**Severity:** INFO **Confidence:** high
**Location:** `src/core/transcripts/index.js:23-38`

No pattern contains nested/overlapping quantifiers of the `(a+)+` catastrophic-backtracking form. The value/token classes (`[A-Za-z0-9_\-]{n,}`, `{12,}=*`) are linear. The JWT rule's three `[A-Za-z0-9_\-]{10,}` groups are separated by literal `.` (excluded from the class), so no cross-boundary ambiguity. The private-key rule uses a **lazy** `[\s\S]*?` between BEGIN/END; a pathological input with many `-----BEGIN … PRIVATE KEY-----` markers and no `END` can cause O(n·m) rescanning (quadratic, per-start-position), but not exponential. Combined with the 4000-char per-message cap applied *around* redaction (note: redaction runs on the *full* pre-truncation text, `capMessage:81`, so the cap does not bound redaction input length — a single 100 MB message would be redacted whole before truncation). Practical risk: low, but the "redact before truncate" ordering means a giant crafted message is fully regex-scanned. Worth a hard input-length guard before `redact()`.

---

## Solid handling (genuinely well done)

- **OAuth token / client storage — strong.** `writeSecretJson` (`src/gws/client.js:95-105`): `mkdirSync(secrets, {mode:0o700})`, write temp with `{mode:0o600}`, explicit `chmodSync(tmp,0o600)`, `renameSync`, then **re-`chmodSync(dest,0o600)`** — atomic and defeats a restrictive/loose umask on both temp and final. `init.js:129-136` creates `secrets/` with `mode:0o700` and re-`chmod 0700` when it created the dir. Token/client are the only files, both 0600, inside the 0700 dir, outside the vault and any git repo. Matches the threat-model claim.
- **OAuth flow — strong.** `src/gws/auth.js`: PKCE with `code_challenge_method: 'S256'` (RFC 8252), 32-byte `crypto.randomBytes` `state`, one-shot loopback bound to `127.0.0.1:0` (ephemeral), callback accepted **only** when `state` matches (raced/CSRF callbacks answered but ignored), 5-min timeout that rejects, and `server.close()` in `finally` so no socket outlives the command (ADR-0004). `client_secret` is never written to logs or echoed; error messages reference only the client-JSON *path*.
- **No committed secrets.** `git grep` for `sk-ant-`, `ghp_`, `ya29.`, `AKIA…`, `BEGIN … PRIVATE KEY`, `1//0…`, `refresh_token":"…` found only synthetic placeholders in specs/fixtures (`WP-007-transcript-parsers.md`, the memory inbox note referencing AWS's own `AKIAIOSFODNN7EXAMPLE`). Nothing real is tracked.
- **Redaction coverage that IS present is applied uniformly.** All three roles (user, assistant, tool_result) for **both** harnesses pass through the same `parse()` → `capMessage()` → `redact()`; Claude tool_results are flattened to text-only blocks first (`claude.js:54-62`); Codex fails closed on unknown roles (`codex.js:57,111`). Redaction runs **before** truncation, and the pass is a single exported function reused by the dream path (no divergent re-implementation).
- **Redaction ordering is correct and load-bearing-aware.** `sk-ant-` (line 25) precedes generic `sk-` (line 26); the WP-007 lesson (`memory/lessons/inbox.md:26`) documents exactly why (the generic alnum class can't span the hyphen), and the code honors it.
- **Alerts are content-safe by design.** `alerts.jsonl` stores only `{job, at, reason, log_hint}`, each capped to 2000 chars, and `reason` is a job-status fact — not transcript/tool-result content (ADR-0012). `formatAlerts` carries `reason` (not the log tail) into the digest, so the digest → `CLAUDE.md` channel does not ferry brain output or transcript bytes.
- **Dream brain is tool-fenced.** `buildClaudeArgs` (`brain.js:46-72`): no Bash, no WebFetch/WebSearch, `--strict-mcp-config` with no MCP config (no network), writes only to the vault (+read scratch), `--setting-sources user` (a repo can't widen tools). Limits what a hijacked dream can exfiltrate — a useful backstop to the redaction weakness, though it does not prevent writing a leaked secret *into the vault*.

---

## Top recommendations (for the maintainer, not applied here)

1. **F2/F1/F4:** Add patterns for Google refresh tokens (`\b1//0[A-Za-z0-9_\-]{20,}`), `sk-proj-`/`sk-svcacct-`, `github_pat_`, `AIza…`, `sk_live_/rk_live_`; and fix the generic rule to not depend on `\b` after `_` (e.g. anchor on `[\w.-]*?(api[_-]?key|secret|token|password|passwd|bearer|credential)` case-insensitively, and widen the value class to include base64 `/+=`).
2. **F3:** Re-run `redact()` on staged note bodies at the commit gate (`validateAndCommit`) and/or in `renderDigest` — defense in depth so a redaction miss cannot become a committed/injected artifact.
3. **F5:** Create `state/`, `dream-scratch/`, `logs/` with `mode 0o700` and their files `0o600`, matching `secrets/`.
4. **F10:** Cap input length before `redact()` (redact per already-capped chunk) to bound worst-case scan cost.
