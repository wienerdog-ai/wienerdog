# Codex adversarial review — round 2 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msnxoroe-11hpkq | Codex session 019fee43-61ef-79a2-a1c1-1626c00d1460
Run: codex-companion.mjs adversarial-review --background --base main, from the wp/neutralize-alert-callout-rendering worktree.
Full fresh round, required by the weighted-closure rule after round 1's HEAVY fixes.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Ne szállítsátok még: az R1–R3 javítások továbbra sem zárják le a korábbi hibákat, az email-residual pedig csak szövegesen van útvonalazva, végrehajtható függőség nélkül.

Findings:
- [high] A Context továbbra is a fizikai sorelválasztásnál erősebb injekciós garanciát tesz (docs/specs/WP-neutralize-alert-callout-rendering.md:35-45)
  A 35–37. sor idézett szabálya azt ígéri, hogy a callout „never an instruction” és „must add no injection surface”; a 41. sor pedig kijelenti, hogy ez a WP „makes the rule true”. A Table A ezzel szemben kifejezetten átengedi az egyszerű ASCII utasításokat és a renderer-szintű struktúrát. A későbbi hatókör-citáció nem vonja vissza ezt az önálló állítást, ezért az R1 javítása nem teljes, és a Mirrored Surface Checklist saját állítása is hamis.
  Recommendation: Töröljétek a JSDoc teljes szabályának igazra fordítását, vagy szűkítsétek magát a hivatkozott JSDoc-kontraktust is kifejezetten a Table A fizikai forrássor-garanciájára.
- [high] Az új lokális határellenőrzést egy hibás neutralizáló is teljesítheti (docs/specs/WP-neutralize-alert-callout-rendering.md:317-326)
  A „code-owned” eredet nem állapítható meg pusztán a kibocsátott bájtokból. Egy nyersen hagyott mező lemásolhatja a kód-owned tailt, majd első kiszökött sorként kibocsáthat egy engedélyezett üres sort, bannert vagy body-headinget. Ekkor a warning-prefix alapján azonosított blokk továbbra is J soros, a callout sor látszólag a megfelelő taillel zárul, és a közvetlen következő sor is az engedélyezett halmazba esik, miközben további mezőtartalom már a blokkon kívül van. Így az R2 helyettesítő kritériuma nem bizonyítja a címében állított univerzálist.
  Recommendation: A kritérium a capDigest előtti teljes formatált callout blokk pontos fizikai sorszámát és keretezését kösse J-hez; ne a blokk után látható, mezőtartalommal byte-azonosan hamisítható sor besorolására támaszkodjon.
- [medium] A readAlerts ténylegesen visszaadhat MAX_FIELD_CHARS-nál hosszabb mezőt (docs/specs/WP-neutralize-alert-callout-rendering.md:207-210)
  A 207. sor mérése csak az appendAlert által már egyszer redaktált alakra igaz. A readAlerts minden érvényes JSONL-sort egyszer ad át a sanitizeAlertnak, amely előbb 2000 UTF-16 egységre szeletel, majd a redactOnly transzformmal bővíthet. HEAD-en egy 2000 karakteres `api_key=aaaaaaaaaaaa ` ismétlés közvetlen readAlerts-bemenetként 3235 karakteres reason értéket adott vissza. Ez előfordulhat kézzel javított, régebbi verzióból maradt vagy másként előállított érvényes állapotnál, ezért a render-budget levághat unsafe karaktert nem tartalmazó post-redaction szöveget, megsértve a Template és byte-identitási állításokat.
  Recommendation: A szerződést a tényleges post-redaction hosszhoz igazítsátok, vagy tegyétek valódi előfeltétellé a redakció utáni capet; ennek megfelelően szűkítsétek a non-widening és byte-frozen univerzálisokat.
- [medium] A self-email kizárás feltétele nem létező, nem deklarált függőség (docs/specs/WP-neutralize-alert-callout-rendering.md:149-153)
  A szöveg a kizárást feltételesnek és a producer WP-t „not optional” munkának nevezi, de a frontmatter `depends_on: []`, és a tree-ben nincs `WP-alert-producer-freeform-residual` specifikáció; a név csak ebben a dokumentumban szerepel. Így az elismert, branded emailbe jutó nyers külső szöveg mitigációja sem útvonalazható, sem szállítási sorrenddel nem kikényszeríthető. Az ownership-indok már őszintébb, de a függőség jelenleg csak ígéret.
  Recommendation: Hozzatok létre ténylegesen útvonalazható producer WP-t és deklaráljátok a szükséges függőségi sorrendet, vagy rögzítsetek explicit tulajdonosi kockázatelfogadást, és ne nevezzétek a kizárást feltételes, kötelező függőségnek.

Next steps:
- Oldjátok fel a Context és Table A garanciája közötti R1-ellentmondást.
- Cseréljétek az R2 határkritériumot nem hamisítható, lokális callout-blokk invariánsra.
- Javítsátok a post-redaction hosszra épített R3 szerződést.
- Tegyétek végrehajthatóvá vagy explicit kockázatelfogadássá az email producer residualját.

Codex session ID: 019fee43-61ef-79a2-a1c1-1626c00d1460
Resume in Codex: codex resume 019fee43-61ef-79a2-a1c1-1626c00d1460
```
