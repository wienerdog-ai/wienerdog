# Contributing to Wienerdog

Thanks for your interest! Wienerdog is developed through a **spec-driven workflow designed for both humans and AI agents** — most of our code is written by AI models following self-contained work-package specs, reviewed by an AI reviewer, and gated by CI and a human maintainer.

## The short version

1. **Small fixes** (typos, doc corrections, obvious bugs): open a PR directly.
2. **Features or non-trivial changes**: open a **work-package proposal** issue first (there's a template). Approved proposals become specs in `docs/specs/`, and specs are what get implemented — by you, or by an AI session you run, or by ours.
3. Every PR must follow the PR template: link the spec (if any), paste verification output, list decisions made, and include a `Generated-by:` line if a model wrote the code. AI-assisted contributions are **welcome and expected** — just say so.

## Ground rules

- Read [`CLAUDE.md`](CLAUDE.md) — it's the implementer constitution for humans and models alike.
- **The iron rule (ADR-0004): Wienerdog is just files.** PRs that add daemons, background services, servers, or telemetry will be declined regardless of quality.
- Touch only what your spec/issue covers. Found something else broken? Note it in the PR description under "Discovered issues" — don't fix it in the same PR.
- Zero new runtime dependencies without an ADR (`googleapis` is the single existing exception).
- Conventional commits; squash-merge; PR title becomes the commit.

## Development setup

```bash
git clone https://github.com/wienerdog-ai/wienerdog
cd wienerdog
npm test
```

Node ≥ 18, no build step. The product is mostly markdown, prompts, and thin Node scripts — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Security issues

Please do **not** open public issues for vulnerabilities — see [SECURITY.md](SECURITY.md).
