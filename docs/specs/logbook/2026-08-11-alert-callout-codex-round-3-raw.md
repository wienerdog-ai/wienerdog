# Codex adversarial review — round 3 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msny40eq-tkegwq
Run: codex-companion.mjs adversarial-review --background --base main, from the wp/neutralize-alert-callout-rendering worktree.
Full fresh round, required by the weighted-closure rule after round 2's HEAVY fixes.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Ne szállítsák még. S4 őszintén kezeli a nem létező WP-t, de S1 továbbra is túl széles ígéretet tesz, S2 deltája átengedi a Table A által elismert renderer-szintű kiszökést, az új truncation-contract pedig belsőleg teljesíthetetlen. S3 helyreállítási indoka sem igaz mind a négy mezőre.

Findings:
- [high] A line-delta csak forrássorokat véd, miközben a criterion és a cím általános digest-sort ígér (docs/specs/WP-neutralize-alert-callout-rendering.md:333-350)
  A delta pontosan J+1 marad olyan, Table A által kifejezetten megengedett ASCII payloadnál is, mint a `</blockquote><br><h1>…</h1>`: nincs új LF, mégis a Markdown renderer bezárhatja a calloutot és új vizuális sort/címsort rajzolhat. Így a delta csak a fizikai forrássor-kiszökést teszi hamisíthatatlanná, nem a criterion „line anywhere” állítását. Ugyanezt a túl széles ígéretet hordozza a frontmatter title és a H1 („forge a digest line”), miközben egyik sem minősíti ezt fizikai forrássorra, és nem is hivatkozik a canonical scope row-ra, a Mirrored Surface Checklist állításával ellentétben.
  Recommendation: A criteriont, a frontmatter címet és a H1-et korlátozza explicit módon fizikai forrássor-containmentre, és hivatkoztassa őket Table A scope sorára; ha renderer-szintű containment a cél, ahhoz külön termékdöntés és szélesebb mechanizmus szükséges.
- [high] Az exact Unicode mapping és a kötelező truncation egyszerre nem teljesíthető (docs/specs/WP-neutralize-alert-callout-rendering.md:362-375)
  A criterion minden mezőpozícióra előírja, hogy az unsafe code point mindig tokenné válik, a safe pedig változatlanul átmegy. Egy budgetet túllépő mező suffixét azonban Table A kötelezően eldobja és egyetlen `…` markerrel helyettesíti, tehát ezekre a code pointokra egyik állítás sem igaz. A következő criterion továbbá minden overflow mezőről azt mondja, hogy egész `<U+XXXX>` tokennel végződik; a spec saját, 3235 karakteres benign/no-unsafe példájának truncált eredményében ilyen token egyáltalán nincs. Emiatt helyes implementáció sem tudja mindkét acceptance criteriont teljesíteni.
  Recommendation: Az exact mapping universalt korlátozza a megtartott prefixre vagy a nem overflowoló mezőkre. A truncation-szabály csak azt követelje, hogy ha escape token kerül a vágási határhoz, az ne legyen félbevágva; benign overflow esetén engedje a safe próza utáni markert.
- [medium] Az egységes truncation indoklása nem igaz a log_hint mezőre (docs/specs/WP-neutralize-alert-callout-rendering.md:219-221)
  A budget sor mind a négy mező egységes truncálását azzal enyhíti, hogy a teljes szöveg elérhető marad a `wienerdog alerts` parancson keresztül. A HEAD-en ez a CLI kiírja a jobot, a kiválasztott időpontokat és a reasont, de a `log_hint` mezőt egyáltalán nem jeleníti meg. Egy régi vagy kézzel létrehozott, benign, budget feletti log_hint ezért rövidül a digestben, és a megígért felhasználói helyreállítási felületen sem érhető el teljesen. Ez különösen problémás, mert éppen ez a mező mutat a hibadiagnosztikai részletekre.
  Recommendation: Javítsa a fallbackre vonatkozó állítást, és kérjen explicit owner-döntést az egységes benign truncationről a ténylegesen elérhető recovery felületek ismeretében; vagy szűkítse a döntést azokra a mezőkre, amelyek teljes értéke valóban elérhető marad.

Next steps:
- Szűkíteni minden mirrored containment-állítást a Table A szerinti fizikai forrássorra.
- Feloldani az exact-mapping és overflow-contract ellentmondását.
- Újradönteni vagy pontosítani a benign log_hint truncationt a valós CLI-viselkedés alapján.

Codex session ID: 019fee4e-3c0e-7852-9ebb-e29d07f0d153
Resume in Codex: codex resume 019fee4e-3c0e-7852-9ebb-e29d07f0d153
```
