# ADR-0001: Record architecture decisions

Status: Accepted
Date: 2026-07-02

## Context

This project is planned by a frontier model with the owner, and implemented mostly by mid-tier models in fresh sessions. Decisions that live only in a chat transcript are lost, and models (and future contributors) will re-litigate or silently contradict them.

## Decision

Every durable decision an implementer might second-guess is recorded as a numbered ADR in `docs/adr/`, under one page, immutable once Accepted. Specs cite ADRs by number; cited ADRs are binding on implementers.

## Consequences

- Decisions are made once; sessions don't drift.
- Small writing overhead per decision — accepted deliberately.
- The ADR log doubles as the project's public reasoning history.
