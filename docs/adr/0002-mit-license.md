# ADR-0002: MIT license

Status: Accepted
Date: 2026-07-02

## Context

The product is prompts, markdown conventions, and thin scripts that users are *meant* to copy, modify, and embed in their own AI configurations. Candidates: MIT vs Apache-2.0.

## Decision

MIT. Apache-2.0's NOTICE propagation and per-file headers add friction exactly where we want frictionless remixing; there is nothing patentable to protect; MIT is the norm of the npm/CLI ecosystem we ride on and matches the "zero legal reading" positioning.

## Consequences

- Maximum remixability; simplest possible story for users and contributors.
- No patent grant — accepted; revisit toward Apache-2.0 only if a corporate-contribution wave demands it (painful direction; the reverse would have been easy — decided knowingly).
- No CLA; DCO only if provenance concerns arise post-launch.
