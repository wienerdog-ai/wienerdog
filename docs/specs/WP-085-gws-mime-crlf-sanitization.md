---
id: WP-085
title: Reject CR/LF in Gmail MIME header fields (close the send-grant header-injection bypass)
status: Draft
model: sonnet
size: S
depends_on: []
adrs: [ADR-0007]
branch: wp/085-gws-mime-crlf-sanitization
---

# WP-085: Reject CR/LF in Gmail MIME header fields

## Context (read this, nothing else)

Wienerdog can send email on the user's behalf through the Google Workspace
(`gws`) module. Outbound sending is the product's single most dangerous
capability: injected content in a session or routine could steer Wienerdog into
emailing private data to an attacker. **THREAT-MODEL T4a / ADR-0007** bounds this
with a **send grant** — a `(routine, recipient-allowlist)` pair in
`~/.wienerdog/config.yaml`. Before any send, `gmail.send()` checks every
recipient against the grant's allowlist; an un-granted or off-allowlist send
degrades to a draft (fail-safe, fail-visible). The `_alert` self-send
(`src/gws/alert.js`) is a separate built-in "self-grant": it may send only to the
authenticated account itself and is claimed to be a **fixed-template self-send**.

This WP closes a verified bypass of that boundary. The MIME builder
(`src/gws/gmail.js` `buildMime`) assembles RFC-2822 headers by joining the `To`,
`Subject`, and `From` fields with `\r\n` and performs **no CR/LF sanitization**.
The send gate (`gmail.send`) only checks the parsed recipients from `opts.to`; it
never inspects `opts.subject`. A caller (or a routine steered by injected content)
that puts a CRLF sequence in the **subject** — e.g.
`--subject $'Report\r\nBcc: attacker@evil.com'` — injects a new `Bcc:` header that
reaches a recipient the allowlist never approved. The same unsanitized builder is
used by `_alert`, so the "fixed-template self-send" invariant is likewise false
for its **subject**: `_alert` builds `Subject: [wienerdog alert] ${opts.subject}`
through `buildMime`, so an attacker-influenced `--subject` carrying a CRLF injects
a header into the nominally self-only alert. (`_alert`'s `opts.body` is placed
AFTER the blank-line separator — `${PREAMBLE}\n\n${opts.body}\n\n${FOOTER}` — so
the body region cannot inject a header; only the subject is a vector.) This
directly defeats ADR-0007.

**Product invariant that bounds this WP:** Wienerdog is just files (ADR-0004);
this is pure string-building code invoked by a short-lived job — it starts
nothing. The fix is defensive input validation only.

## Current state

`src/gws/gmail.js` — `buildMime(m)` (lines ~175–185) builds the message with no
header sanitization:

```js
function buildMime(m) {
  const lines = [];
  if (m.from) lines.push(`From: ${m.from}`);
  lines.push(`To: ${m.to}`);
  lines.push(`Subject: ${m.subject}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('');
  lines.push(m.body);
  const mime = lines.join('\r\n');
  return Buffer.from(mime).toString('base64url');
}
```

`buildMime` is the single choke point for MIME construction: `draft`, `send`
(both in `gmail.js`), and `_alert` (`src/gws/alert.js`, which `require`s
`buildMime` from `./gmail`) all route through it. `gmail.js` does not currently
import `WienerdogError`. The project's error type is
`src/core/errors.js` → `class WienerdogError` (a plain-message error the CLI
prints without a stack).

The gate itself is sound for the `to` field: a CRLF-bearing `to` produces a
single un-splittable "recipient" that fails the allowlist and degrades to a
draft. The unguarded vector is the **subject** (and, defensively, `from`), which
never touches the gate.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file, docs/specs/ROADMAP.md, package-lock.json. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | src/gws/gmail.js | import `WienerdogError`; add `assertHeaderSafe`; reject CR/LF in `from`/`to`/`subject` inside `buildMime` |
| modify | tests/unit/gws-gmail.test.js | add CRLF-injection rejection tests for `buildMime`, `send`, and (via `alert`) `_alert` |

### Exact contracts

Add a private helper and call it for every header field before the field is
interpolated into a header line:

```js
const { WienerdogError } = require('../core/errors');

/** Reject a header field value that contains a CR or LF (RFC-2822 header
 *  injection — a bare/paired CR/LF would smuggle an extra header such as Bcc:,
 *  defeating the send-grant allowlist, ADR-0007). Header fields are single-line
 *  by construction (addresses, a subject); a legitimate value never contains a
 *  line break, so rejecting is safe and is the fail-closed choice.
 *  @param {string} value @param {string} field  e.g. 'Subject'
 *  @returns {string} the value unchanged when safe; throws otherwise. */
function assertHeaderSafe(value, field) {
  if (/[\r\n]/.test(String(value))) {
    throw new WienerdogError(`refusing to build email: ${field} contains a line break (possible header injection)`);
  }
  return String(value);
}
```

`buildMime` applies it to each header field (NOT to the body — a multi-line body
is legitimate content that appears after the blank-line separator and cannot
inject a header):

```js
function buildMime(m) {
  const lines = [];
  if (m.from) lines.push(`From: ${assertHeaderSafe(m.from, 'From')}`);
  lines.push(`To: ${assertHeaderSafe(m.to, 'To')}`);
  lines.push(`Subject: ${assertHeaderSafe(m.subject, 'Subject')}`);
  lines.push('Content-Type: text/plain; charset="UTF-8"');
  lines.push('');
  lines.push(m.body);           // body unchanged — content, not a header
  const mime = lines.join('\r\n');
  return Buffer.from(mime).toString('base64url');
}
```

Behavior:
- `buildMime({to:'a@b.com', subject:'x\r\nBcc: e@evil.com', body:'hi'})` **throws**
  `WienerdogError` (before any network call).
- A normal `buildMime({to:'a@b.com', subject:'Report', body:'hi'})` is byte-for-byte
  identical to today's output (the helper returns the value unchanged).
- `send()` calls `buildMime` only after the gate allows — so a CRLF subject on an
  otherwise-granted send now throws instead of sending an injected `Bcc:`. (The
  throw propagates as a normal `gws` error; the caller does not send.)
- `_alert` throws on a CRLF-bearing **subject** (its only header-injection vector;
  its body is post-blank-line content) rather than sending an injected header.

## Implementation notes & constraints

- Zero new dependencies; plain Node ≥ 18, JSDoc types only (CLAUDE.md).
- Do **not** strip/rewrite the value — reject it. Silent stripping could alter a
  legitimate subject and hides an attack; a throw is fail-loud and testable.
- Do not change the gate (`isSendAllowed`), `draft`, or the base64url encoding.
  Do not touch `alert.js` — the fix lives entirely in the shared `buildMime`.
- The body is intentionally NOT validated: it is post-blank-line content, and
  multi-line bodies are normal. (An attacker cannot inject a header from the body
  region.)

## Security checklist

- [ ] Every value interpolated into an RFC-2822 **header** line (`From`, `To`,
      `Subject`) is validated to contain no `\r` and no `\n` (fully-anchored
      character-class check `/[\r\n]/`), in the single choke point (`buildMime`)
      that `draft`/`send`/`_alert` all use — so no header-injection path can add a
      `Bcc:`/`Cc:` that bypasses the ADR-0007 allowlist.
- [ ] The validation FAILS CLOSED (throws `WienerdogError`, no send) rather than
      stripping — an injection attempt never silently succeeds or silently mutates.
- [ ] The `_alert` self-send is now genuinely fixed-template: an
      attacker-influenced `--subject` that carries a CRLF is rejected before it can
      inject a header. (`_alert`'s body is post-blank-line content and is NOT a
      header vector, so it is intentionally not validated — consistent with
      `buildMime` leaving the body unchanged.)

## Acceptance criteria

- [ ] `buildMime` throws `WienerdogError` when `from`, `to`, or `subject` contains
      `\r` or `\n`.
- [ ] `buildMime` output is unchanged (byte-for-byte) for line-break-free inputs.
- [ ] `send()` with a granted recipient but a CRLF-bearing subject throws (does not
      call `services.gmail.users.messages.send`) — proved by a stub `services` whose
      `send` records calls.
- [ ] `_alert` (via `alert.run`) throws when `opts.subject` contains a CRLF (proved
      by a stub `services`).
- [ ] Running the same safe send twice is unaffected (idempotence unchanged).

## Verification steps (run these; paste output in the PR)

```bash
npm test -- --test-name-pattern gmail
npm test
npm run lint
```

## Out of scope (do NOT do these)

- Any change to the send-grant gate, empty-recipient handling, or the grant CLI —
  that is **WP-086**.
- OAuth flow, secrets permissions, or token persistence.
- Body CRLF normalization / MIME multipart support.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/085-gws-mime-crlf-sanitization`; conventional commits; PR titled
   `fix(gws): reject CR/LF in MIME header fields (WP-085)`.
3. PR template filled, including "Decisions made" (or "none") and `Generated-by:`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
