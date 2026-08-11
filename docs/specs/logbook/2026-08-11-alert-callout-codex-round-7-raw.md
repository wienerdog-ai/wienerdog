# Codex adversarial review — round 7 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msokilug-ukpyz8
Run: codex-companion.mjs adversarial-review --background --base main.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Ne szállítsátok még: W3 valóban javítva van, de W1 továbbra is fennáll, W2 indoklása pedig még mindig hamis producer-feltételezésre épül. Egy további acceptance criterion szó szerint teljesíthetetlen.

Findings:
- [high] W1 továbbra is fennáll az unsafe-set acceptance criterionban (docs/specs/WP-neutralize-alert-callout-rendering.md:383-387)
  A criterion az emitted line-ról állítja, hogy minden unsafe karakter `<U+XXXX>` formában jelenik meg. Over-budget mezőnél azonban az emitted field kizárólag a refusal sentence, ezért az eredeti unsafe karakterek egyáltalán nem jelennek meg tokenként. A mondat így ismét összekeveri az encoded-form exactness és az emitted-field containment szabályát; egy helyes refusal ág nem tudja szó szerint teljesíteni.
  Recommendation: Az exact token mappinget kösse explicit módon az ENCODED FORM-hoz; az EMITTED FIELD-re csak azt állítsa, hogy unsafe karakter nem jut ki nyersen, illetve encoded-branch esetén pontosan az encoded form kerül ki.
- [medium] A per-field budget criterion ellentmond a specifikáció saját byte-starvation elemzésének (docs/specs/WP-neutralize-alert-callout-rendering.md:416-418)
  A criterion szerint a budget miatt „no field can be the reason the prefix grows”. A spec viszont a 315–318. sorban helyesen rögzíti, hogy egy rövid escapable mező 10-ről 80 karakterre nőhet, és emiatt body byte-okat szoríthat ki. Egy helyes implementáció tehát okozhat mezőből eredő prefixnövekedést; csak annak felső korlátját tartja meg.
  Recommendation: Törölje a prefix-növekedést kizáró következtetést, és korlátozza az állítást a per-field felső korlátra, illetve arra, hogy a változás nem növeli a worst-case mezőkorlátot.
- [medium] W2 mérése továbbra sem kizárólag fix template-et mér (docs/specs/WP-neutralize-alert-callout-rendering.md:240)
  A 353 karakteres „fully code-owned” reason állítás a `run-job.js` 839–850. soraira hivatkozik, de az ottani reason interpolálja a `policyHooks.sources.join(', ')` értékét. Ezek policy-fájlútvonalak, köztük a drop-in könyvtárból olvasott több, változó hosszúságú `.json` fájlnévvel. Ez tehát egy további dinamikus, budgetet elérő producer-path, nem fix template; a benign-refusal árának „measured proportions” indoklása továbbra sem megalapozott.
  Recommendation: Távolítsa el a „longest fully code-owned” felső korlátot, vagy szűkítse egy pontosan megnevezett mért példányra; a dinamikus policy-hook source-listát is nevezze meg az unbounded producer-pathok között.

Next steps:
- Javítsátok a két ellentmondó acceptance criteriont.
- Pontosítsátok a W2 mérésének tényleges populációját, majd ismételjétek meg a friss review-kört.

Codex session ID: 019ff08c-74c6-70e3-893c-c2f646fd2e52
Resume in Codex: codex resume 019ff08c-74c6-70e3-893c-c2f646fd2e52
```
