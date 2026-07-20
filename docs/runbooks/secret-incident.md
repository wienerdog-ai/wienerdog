# Runbook: secret incident (a leaked credential reached the vault)

This is the credential-specific case of the general incident drill. If you
suspect a broader compromise — the machine itself, or your injected
identity/context, not just one leaked credential — start at
[`incident.md`](incident.md) instead.

Wienerdog scrubs secret-looking text at four points before it is committed, logged,
or shown to you (see [`docs/THREAT-MODEL.md`](../THREAT-MODEL.md), T4). That
scrubbing is **best-effort, not proof** — an unusual or encoded credential can
still slip through and end up in a vault note, a log, or an alert. If you know a
real credential (an API key, an OAuth token, a password) was captured, work
through this checklist **in order**. Steps are ordered so nothing keeps writing
or re-injecting the secret while you clean up.

1. **Stop the schedules.** Nothing should read, commit, or inject anything else
   while you're cleaning up. List what's scheduled, then remove each job:

   ```
   wienerdog schedule list
   wienerdog schedule remove <name>
   ```

   Run `remove` for every job that touches the vault (the nightly dream, and any
   routine from the catalog). You'll re-add them in step 5 — `schedule remove`
   only unregisters the job; nothing else changes.

2. **Revoke, then rotate, the leaked credential — at the provider** (Google,
   OpenAI, AWS, GitHub, Stripe, wherever the credential came from). **Revoke**
   means telling the provider "this credential no longer works, starting now."
   **Rotate** means issuing a brand-new credential to replace it. Do these in
   that order: a credential you rotated but haven't revoked is still live and
   still usable by anyone who has it.

3. **Purge the injected copies.**
   - Fix the vault note that held the secret (delete the secret text, or delete
     the whole note if that's simpler), then run `wienerdog sync` — it
     re-renders `state/digest.md` from the current vault content, so a clean
     note produces a clean digest. If you'd rather not wait, delete
     `state/digest.md` yourself first; `sync` recreates it.
   - **Also check `state/quarantine/`.** This is where Wienerdog set aside a
     dream note it wouldn't commit because it looked like it contained a
     secret (see T4, gate ii) — the digest shows a banner while this folder
     is non-empty. Open each file: if it's a **true positive** (it really does
     hold the secret), delete it once you've finished rotating in step 2 — it
     holds the raw bytes, not a redacted copy. If it's a **false positive**
     (the scanner was wrong), you can copy its content back into the vault by
     hand; the banner clears once the folder is empty.

4. **Clean the git history.** The vault is a local git repository (`git log` in
   your vault folder), and a committed secret lives in its history, not just
   the current files — deleting the file today doesn't remove it from an
   earlier commit. **Git history** here means every past commit, all still on
   disk even after you fix the current version.
   - If the secret was committed **recently and is the most recent commit**,
     rewrite just that commit:
     ```
     git commit --amend
     ```
     (or `git rebase -i HEAD~<n>` to edit an older-but-nearby commit and
     remove the line there).
   - If the secret has been committed for a while, or appears in many commits,
     use a history-rewriting tool built for this — `git filter-repo` (the
     currently maintained tool) or the BFG Repo-Cleaner — pointed at the file
     or the secret string, following that tool's own instructions.
   - This is safe to do because **the vault is local and was never
     auto-pushed** anywhere (see the Privacy posture section of the threat
     model) — you're rewriting your own machine's history, nothing else has a
     copy. **Exception:** if you (or a tool acting for you) ever pushed this
     vault to a fork, remote, or backup service, you must **force-push** the
     rewritten history there too, and you should still treat the credential as
     compromised regardless of how carefully you clean up — anything that had
     already fetched or cached the old history may still hold it.

5. **Re-authorize.** Only after steps 1–4:
   - Re-add the schedules you removed in step 1: `wienerdog schedule add …`
     (or pick them again from the routine menu, `/wienerdog-routines`).
   - Run `wienerdog doctor` to confirm nothing is flagged (it checks, among
     other things, that no Wienerdog file is readable by other users).
   - Confirm `state/quarantine/` is empty — while anything is in it, the
     digest keeps showing a "held for review" notice.
   - Open the digest and confirm it's clean, and confirm the *new*, rotated
     credential works where you use it.
