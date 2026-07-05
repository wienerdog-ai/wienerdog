---
id: WP-052
title: Agent-driven install UX — plan-then-install prompt, package trust, restart-to-load note
status: Done
model: sonnet
size: S
depends_on: []
adrs: [ADR-0006, ADR-0011]
branch: wp/052-agent-driven-install-ux
---

# WP-052: Agent-driven install UX — plan-then-install prompt, package trust, restart-to-load note

## Context (read this, nothing else)

Wienerdog is installed either from a terminal (`curl … | bash` or
`npx wienerdog@latest init`) **or** by pasting a short prompt into Claude Code /
Codex CLI so the AI runs the install for the user. The README carries that
paste-in prompt. This WP is **docs/skill prose only** — no code changes.

A from-scratch install test on a Windows Server 2022 VPS, driven by **Claude Code
running the README prompt**, surfaced three friction points in that agent-driven
path:

1. **The plan-then-stop stall.** `npx wienerdog@latest init` under an agent shell
   printed its plan and stopped waiting for confirmation, so the run stalled
   until the user re-ran it with `--yes`. `init` supports `--dry-run` (prints the
   plan and stops, no changes) and `--yes` (skips confirmation). The right agent
   choreography — and the correct consent posture — is: **first** run
   `init --dry-run` and show the user the plan, **then** run `init --yes` to
   actually install. In an agent-driven install the human in the chat IS the
   consent surface, so a single `--yes` after the plan is shown is exactly right
   (this respects ADR-0011's per-step-consent intent without a second terminal
   round-trip). **This WP does NOT change `init`'s own prompting behavior** — the
   `/dev/tty` + `--yes` design stands; we only fix the *instructions* the README
   gives the driving agent.

2. **Package-trust stall.** The driving agent balked with "I don't recognize
   wienerdog" before running an `npx` package it had never seen. The README
   prompt should hand the agent the canonical metadata to verify in one hop: the
   GitHub repo (`https://github.com/wienerdog-ai/wienerdog`) and the npm page
   (`https://www.npmjs.com/package/wienerdog`).

3. **Skills invisible until restart.** After install, the `/wienerdog-*` slash
   commands (including `/wienerdog-setup`) did not appear until the harness was
   restarted — Claude Code / Codex load skills at startup. The agent should tell
   the user to **restart** the harness after install, then run `/wienerdog-setup`.

The fix lives where the paste-in prompt lives. A repo-wide grep
(`Please install Wienerdog`, `walk me through`) finds the prompt **only** in
`README.md`; there is no second copy to update. The setup skill
(`skills/wienerdog-setup/SKILL.md`) has one install-adjacent instruction — the
"config.yaml is missing → tell them to install first" branch in its Step 1 — that
should be brought in line with the same posture (versioned command + restart
note). Keep all user-facing text in **plain knowledge-worker language** (no
developer jargon without explanation), per CLAUDE.md.

## Current state

### `README.md` — the install-by-paste section (to rewrite)

Verbatim, the block to replace (currently lines 13–25):

```markdown
Not comfortable with the terminal at all? Paste this into Claude Code or Codex instead, and your AI will run the install for you (approving each step):

​```
Please install Wienerdog for me: run `npx wienerdog@latest init`, then walk me through /wienerdog-setup.
​```

Then, inside Claude Code or Codex CLI:

​```
/wienerdog-setup
​```

That's it. Your AI interviews you, builds your memory vault, and starts remembering.
```

(The `​` shown above marks the fenced-code backtick lines; in the file they are
plain ```` ``` ```` fences. Reproduce real triple-backtick fences.)

### `skills/wienerdog-setup/SKILL.md` — Step 1 missing-config branch (to adjust)

Verbatim, the bullet to replace (in "## Step 1 — Find the vault"):

```markdown
- **If `config.yaml` itself is missing** → stop; tell them to run
  `npx wienerdog init` first, then start this skill again.
```

Everything else in both files stays exactly as-is.

## Deliverables (permission boundary — touch ONLY these)

<!-- Always allowed without listing: this spec file (the status flip),
     docs/specs/ROADMAP.md, package-lock.json. Everything else must be listed. -->

| Action | Path | Notes |
|--------|------|-------|
| modify | README.md | rewrite the install-by-paste section (verbatim replacement below) |
| modify | skills/wienerdog-setup/SKILL.md | replace the Step 1 missing-config bullet (verbatim replacement below) |

### Exact contract — `README.md` replacement

Replace the block quoted in "Current state" with **exactly** this (real
triple-backtick fences; keep the surrounding document unchanged):

````markdown
Not comfortable with the terminal at all? Paste the prompt below into Claude Code
or Codex and your AI will install Wienerdog for you. It shows you the plan first,
installs only after you have seen it, and points you at the metadata so a cautious
AI can confirm the package is genuine before running it — you are the approval
step at every point.

```
Please install Wienerdog for me. It's an open-source tool that gives an AI a
memory and daily routines using plain files. Before running anything, you can
verify it: GitHub https://github.com/wienerdog-ai/wienerdog, npm
https://www.npmjs.com/package/wienerdog. Then:
1. Show me the plan: run `npx wienerdog@latest init --dry-run` and summarize what
   it would create. Wait for me to say go ahead.
2. Install it: run `npx wienerdog@latest init --yes`.
3. Tell me to restart Claude Code (or Codex) so the new /wienerdog-* commands
   load — they only appear after a restart.
4. After I restart, walk me through /wienerdog-setup.
```

After the restart, inside Claude Code or Codex CLI:

```
/wienerdog-setup
```

That's it. Your AI interviews you, builds your memory vault, and starts
remembering.
````

### Exact contract — `skills/wienerdog-setup/SKILL.md` replacement

Replace the Step 1 missing-config bullet quoted in "Current state" with
**exactly** this bullet (same list, same indentation):

```markdown
- **If `config.yaml` itself is missing** → Wienerdog is not installed yet. Tell
  them to run `npx wienerdog@latest init` in their terminal (or paste the install
  prompt from the README so their AI does it), then **restart Claude Code /
  Codex** so the `/wienerdog-*` commands load, and start this skill again.
```

## Implementation notes & constraints

- Docs/skill prose only — no code, no test changes. `npm run lint` still runs
  markdownlint + the frontmatter schema over both files; keep line length and
  fencing clean so lint passes. The SKILL.md frontmatter (`name`/`description`)
  is unchanged.
- Do NOT change `init`'s prompting behavior, `--yes`/`--dry-run` semantics, the
  `/dev/tty` design, or any other file. This WP changes only the *instructions*
  documents give.
- Verify (do not assume) that `init --dry-run` and `init --yes` both exist before
  relying on them: they do — `src/cli/init.js` parses `--dry-run` ("prints the
  plan and stops") and `--yes` ("skips confirmation"). The prompt uses both.
- Keep the URLs exactly as given: repo `https://github.com/wienerdog-ai/wienerdog`,
  npm `https://www.npmjs.com/package/wienerdog`. These match the org
  (`wienerdog-ai`) and package (`wienerdog`) used elsewhere in the repo.
- Plain language for knowledge workers; do not introduce terms like "flag",
  "CLI", or "argument" without the surrounding sentence making them
  self-explanatory (the given text already avoids this).
- When uncertain: choose the simpler option and note it in the PR under
  "Decisions made". Do NOT expand scope.

## Acceptance criteria

- [ ] The README paste-in prompt instructs the agent to (1) offer the repo + npm
      URLs for verification, (2) run `npx wienerdog@latest init --dry-run` and
      show the plan, (3) run `npx wienerdog@latest init --yes` to install,
      (4) tell the user to restart the harness, (5) then run `/wienerdog-setup`.
- [ ] The README no longer contains the old one-line
      `Please install Wienerdog for me: run … then walk me through /wienerdog-setup`
      prompt.
- [ ] The SKILL.md Step 1 missing-config bullet uses `npx wienerdog@latest init`
      and includes the restart-to-load-commands note.
- [ ] No file other than `README.md` and `skills/wienerdog-setup/SKILL.md` (and
      this spec / ROADMAP) is changed.
- [ ] `npm run lint` passes.

## Verification steps (run these; paste output in the PR)

```bash
grep -n "init --dry-run" README.md
grep -n "init --yes" README.md
grep -n "restart" README.md skills/wienerdog-setup/SKILL.md
grep -c "Please install Wienerdog for me: run" README.md   # expect 0
npm run lint
```

## Out of scope (do NOT do these)

- Any change to `init`'s prompting, `--yes`/`--dry-run` behavior, or the
  `/dev/tty` consent design (WP-034 / ADR-0011 stand).
- The `install.sh` / curl one-liner block (unchanged) and the "Prefer npm?"
  paragraph.
- A Windows `.cmd` shim or `repointCurrent` behavior — that is WP-051 (code).
- Any new marketing/docs pages; this is a targeted edit to the two files above.

## Definition of done

1. All verification steps pass locally; output pasted into the PR body.
2. Branch `wp/052-agent-driven-install-ux`; conventional commits; PR titled
   `docs(readme): plan-then-install prompt, package trust, restart note (WP-052)`.
3. PR template filled, including "Decisions made" (or "none") and
   `Generated-by:`. Credit the external reporter in the PR body:
   `Reported-by: external user (Windows Server 2022 agent-driven install test)`.
4. This spec's `status:` flipped to `In-Review` in the same PR.
