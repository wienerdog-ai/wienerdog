# Codex adversarial review — round 5 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msnyq3da-lp2ihi
Run: codex-companion.mjs adversarial-review --background --base main, from the wp/neutralize-alert-callout-rendering worktree.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Nem szállítható. A maximalitás önmagában egyértelmű, de az U1 javítása nem tette közösen kielégíthetővé a szerződést: a tokenhatár szabály ütközik a kötelező byte-pontos pass-through-val. Egy másik elfogadási feltétel szintén ellentmond az unsafe karakterek kötelező kódolásának.

Findings:
- [high] A tokenhatár és a maximális, pontos pass-through közösen nem teljesíthető (docs/specs/WP-neutralize-alert-callout-rendering.md:224)
  A szerződés nem injektív, és a biztonságos karaktereket változatlanul kell átengedni. Legyen a keret 2000, a forrás pedig `a` 1997-szer, majd a literális `<U+`, végül `x`. A maximális megtartott prefix pontosan 2000 karakter és literális `<U+` végű; az előírt eredmény ehhez hozzáfűzi az overflow jelet. Ez teljesíti a maximalitást, az outputkorlátot, a pontos leképezést és az idempotenciát, de megsérti azt a byte-szinten olvasható szabályt, hogy a marker előtti szekvencia nem lehet részleges `<U+…`. Ha az implementáció további karaktereket dob vagy módosít ennek elkerülésére, a maximalitást vagy a pontos pass-through-t sérti. A szemantikus „nem vágunk egy generált tokenbe” és a lexikális „az output nem végződhet tokenprefixszel” olvasat tehát eltér.
  Recommendation: A határt provenance-alapon definiálja: minden megtartott forrás-kódpont teljes kódolása kerüljön az outputba, és generált escape token ne legyen részlegesen megtartva. Mondja ki, hogy a változatlanul átengedett literális tokenprefix megengedett; törölje a lexikális output-suffix követelményt a megfelelő elfogadási feltételből is.
- [medium] Az outputkorlát elfogadási feltétele byte-azonosságot követel az escape-elendő inputokra is (docs/specs/WP-neutralize-alert-callout-rendering.md:398-400)
  A „field already inside [the budget] comes back byte-identical” nincs biztonságos karakterekre szűkítve. Egyetlen LF már a kereten belül van, de a helyes leképezése `<U+000A>`, ezért nem lehet byte-azonos. Akkor is fennáll az ellentmondás, ha az „inside” a teljes kódolt alak kereten belüliségét jelenti: az escape továbbra is megváltoztatja a byte-okat. Így a helyes implementáció nem tudja egyszerre teljesíteni ezt és az unsafe-set leképezést.
  Recommendation: Cserélje a követelményt arra, hogy ha a mező teljes Table A szerinti kódolása belefér, akkor pontosan ez a teljes kódolt alak jelenjen meg hozzáfűzött overflow marker nélkül. A nyers byte-azonosság maradjon kizárólag a már külön rögzített benign/no-unsafe esetre.

Next steps:
- A Table A tokenhatár sorát és a 384–397. sorok tükrözött elfogadási feltételét együtt pontosítani.
- A 398–400. sorok outputkorlát-feltételét a teljes kódolt alakra, nem a nyers input byte-jaira megfogalmazni.
- A módosítás után új, friss kontextusú adversarial review szükséges.

Codex session ID: 019fee5d-f327-7ef1-8b94-5bd229641f4e
Resume in Codex: codex resume 019fee5d-f327-7ef1-8b94-5bd229641f4e
```
