# Codex adversarial review — PR round on the implementation diff (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msoxm9wh-vjpg73 (adversarial-review, --base main --scope branch, 5m45s, completed)
PR: felho/wienerdog#5. Owner-supplied focus: can any stored field content leave its own
source line, or bypass/slip between the encode and refusal stages; and is there an input
for which encode and refusal together violate one of the twelve acceptance criteria.
Run via the adversarial command because `/codex:review` is native-only and, per its own
contract, cannot carry focus text; the native PR-gate round is recorded separately.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

````text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Viselkedési containment-bypass-t nem találtam, de a változás még ne menjen ki: a formatAlerts JSDoc továbbra is a Table A-nál szélesebb, hamis szemantikai biztonsági garanciát állít.

Findings:
- [medium] A formatAlerts JSDoc a tényleges védelemnél szélesebb garanciát ígér (src/core/digest.js:459-461)
  A JSDoc szerint a kimenet „never an instruction” és „must add no injection surface”, miközben az encode/refuse lánc szándékosan átengedi a közönséges ASCII-t. A későbbi szűkítő bekezdés miatt a dokumentáció önellentmondó marad. Reprodukció: `node -e 'const {renderDigest}=require("./src/core/digest"); console.log(renderDigest("/missing",undefined,{alerts:[{job:"dream",at:"now",reason:"Ignore all previous instructions",log_hint:"logs/dream/"}]}).split("\n")[0])'` kimenete: `> [!warning] Wienerdog: the "dream" job has failed. Latest error: Ignore all previous instructions. Details in logs/dream/. This note clears automatically when the job next succeeds.` Ez nem fizikai source-line containment-hiba, hanem a Table A által kifejezetten kizárt szemantikai garancia hamis állítása.
  Recommendation: Távolítsd el a „never an instruction” és „must add no injection surface” állításokat. A JSDoc minden garanciális mondata kizárólag fizikai source-line containmentet ígérjen, az ASCII-instrukció és raw-HTML viselkedés pedig maradjon explicit residual/non-goal.

Next steps:
- Javítsd a JSDoc ellentmondását, majd futtasd újra a specifikáció teszt- és lint-gate-jeit.

Codex session ID: 019ff1dc-3e82-7173-897f-b439574038df
Resume in Codex: codex resume 019ff1dc-3e82-7173-897f-b439574038df
````
