---
title: Round zero — template conformance (raw), WP-dream-baseline-delta-primitive
date: 2026-08-21
---

# Round zero — template conformance (raw)

Spec under review: `docs/specs/WP-dream-baseline-delta-primitive.md` at commit
`b2cde6f`. Base tree: `main` @ `e648284`. Run in a clean context per
`docs/runbooks/codex-review.md`: an executor that took no part in drafting, given
exactly two inputs — the spec and `docs/specs/_TEMPLATE.md` — instructed to read
nothing else and to judge conformance only, never design. Line numbers are the
reviewer's, against `b2cde6f`.

## A. Section diff

All sixteen template sections PRESENT (frontmatter L1-10; title L12; authoring bullet
L14-15; Context L26; Current state L58; Deliverables L77; Exact contracts L90;
Contract reference L107; the contract tables L113/L127/L140; Mirrored Surface
Checklist L152; Implementation notes L162; Security checklist L180; Acceptance
criteria L197; Verification steps L224; Out of scope L243; Definition of done L259).

**No section is silently ABSENT.** The only `N/A` in the document is the
template-sanctioned idempotence item (L219-220).

Non-blocking: the literal heading `### Contract table(s)` is replaced by three named
per-contract headings, which the template's own body ("one canonical table per dense
contract") invites. Extra content, all named: the Dispatch-precondition block
(L17-24), the Deliverables trailing note (L88-89), the post-fence commentary in
Verification steps (L236-241). No extra headings.

## B. Frontmatter

Every declared key present and in range: `id` matches the filename; `title` is
verb-first; `status: Draft`; `model: opus`; `size: M` (**not** the forbidden `L`);
`depends_on: []`; two `adrs`; optional `epic` set. **Zero blocking items.**

## C. Template-driven obligations

1. Deliverables columns and "touch ONLY these" framing — HONOURED, including the
   always-allowed comment naming the same four paths as the template.
2. Contract-reference activation — HONOURED: three of seven named by their template
   numerals (i, iii, vi), above the 2-of-7 bar, correctly not `N/A`'d.
3. Contract tables imply a Mirrored Surface Checklist — HONOURED, and its entries name
   spec-specific mirrors rather than the template's generic bullets.
4. Security checklist — PRESENT, not deleted. Non-blocking: item 1 paraphrases the
   template's anchored-pattern item and answers it, and two further items are added.
5. Acceptance criteria binary, idempotence answered — HONOURED; the idempotence item
   is `N/A` **with a reason**, in the prescribed form.
6. Verification steps runnable — HONOURED: four runnable commands, no prose-only step
   inside the fence.
7. Greenfield Current state — HONOURED: the template's own formulation, plus cited
   context files that are explicitly not edited.
8. Definition of done — HONOURED: all five items, in order, item 5 verbatim.

## D. Verdict

**CONFORMANT — 0 blocking items, 4 non-blocking observations** (the per-contract
heading names, the paraphrased-plus-extended security item, and the two extra
unheaded blocks).
