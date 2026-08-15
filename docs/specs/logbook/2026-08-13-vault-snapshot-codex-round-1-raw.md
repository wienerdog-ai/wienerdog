# Adversarial design review round 1 — pre-ruling draft

WP: WP-gate-vault-snapshot
Backend: gptsol | subagent transcript agent-a5e5239abdaeeb142.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
# Eredmény

**NO-SHIP.** A specifikáció jelenlegi formájában nem alkalmas implementálásra. A napi jegyzeteken át vezető M3 útvonal lényegében nyitva marad, a jelentésbélyeg ugyanazon napi ismételt futásnál biztonságos értéket írhat felül nem biztonságossal, a csonkolás elveszítheti a taint bizonyítékát, és a specifikáció saját ellenőrzései egymásnak ellentmondanak.

## Végrehajtott ellenőrzések

### Repository-állapot

- `git status --porcelain=v1`, branch és HEAD ellenőrzése a review elején: **exit 0**
  - branch: `wp/gate-vault-snapshot`
  - HEAD: `6716cac9bccabb741750413f66fabc0389096309`
  - porcelain output: üres
- Ugyanez a review végén: **exit 0**, azonos branch, HEAD és üres porcelain output.

### Forrásellenőrzés

A kért elsődleges és támogató fájlokat elolvastam, beleértve:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/vault-snapshot.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/routine-runtime.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/secret-scan.js`
- a teljes `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/` könyvtár
- a megadott threat modelt, ADR-t, auditot, logbook-bejegyzést, `CLAUDE.md`-t és spec-authoring runbookot.

További lefuttatott vizsgálatok:

- Transcript parserfájlok listázása: **exit 0**
- Dream report olvasóinak és íróinak `rg`-keresése: **exit 0**
- Stamp/commit/recovery útvonalak keresése: **exit 0**
- Minden `renderDigest` option-producer keresése: **exit 0**
- Quarantine-banner és reason útvonalak keresése: **exit 0**
- Dream modell olvasható/írható gyökereinek keresése: a hibás első keresés **exit 2**, a javított keresés **exit 0**
- Két további exploratory `rg` keresés hiányzó vagy rosszul megadott útvonal miatt **exit 2**; a megfelelő fájlokat utána közvetlenül elolvastam.

### Line-citation ellenőrzés

- A specifikációból kinyert, összesen **55 hivatkozott line range** automatikus tartományellenőrzése: **exit 0**
- Eredmény: `MISSING_OR_OUT_OF_RANGE=0`
- Minden hivatkozás létező sorokra mutat.
- Egy hivatkozás szemantikailag hibásan van jellemezve: az ADR-0032 `80-82` sorai nem állítják azt, amit Table E cáfolni akar. Ez külön finding alább.

### Viselkedési próbák

A `parse()` és `parseNoteResult()` konkrét report/note alakokon történő futtatása: **exit 0**.

Megfigyelt eredmények:

- jelenlegi dream report: trusted
- első sorban `---`, közte normál report prose: `malformed`
- szabályos YAML-listás frontmatter: `malformed`
- lezáratlan frontmatter: frontmatter nélkülinek, tehát trustednek számít
- kétszeres code-owned stamp: az első stamp értéke irányít

Exportellenőrzés:

- `parseNoteResult` exportált függvény: **exit 0**

### Tesztek és lint

- `npm test -- --test-name-pattern "vault-snapshot"`: **exit 0**
- `npm test -- --test-name-pattern "routine-runtime"`: **exit 0**
- `npm test`: **exit 0**
- Megismételt teljes tesztfuttatás összegzése:
  - 1981 test
  - 1972 pass
  - 0 fail
  - **exit 0**
- `npm run lint`: **exit 1**
  - két MD038 hiba magában a specifikációban:
    - `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:98`
    - `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:244`

### A specifikáció jelenlegi-tree gate-jei

- ADR numstat gate: **exit 1**
- THREAT-MODEL numstat gate: **exit 1**
- Régi threat-model szöveg hiányának gate-je: **exit 1**
- A négy megnevezett neutralizer létezése: **exit 0**
- `parseNoteResult` jelenléte a jelenlegi snapshot modulban: **exit 1**
- `derived_from_untrusted` hiánya a snapshot modulból: **exit 0**

Az amender-line, PROPOSED-line és új threat-model bullet végső-state gate-jeit nem futtattam kész implementáció hiányában. A specifikáció által előírt változatok ráadásul ideiglenes fájlok létrehozását igénylik, ami nem fért bele a read-only review-ba.

---

## Finding 1 — A heti review napi-jegyzet útvonala továbbra is átengedi az M3 támadást

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 338
- **line_end:** 378
- **confidence:** 0.99
- **impact:** High

A specifikáció saját Residual 1 része kimondja, hogy a napi jegyzeteken a provenance gate ma inert, mert semmi nem ír rájuk `derived_from_untrusted` értéket. Residual 5 kimondja, hogy a `weekly-review` egész napi jegyzeteket kap, per-line framing nélkül. Table C egy távoli promptmondatot ad, amelyet maga a specifikáció csak defense-in-depth rétegnek tekint.

Ez azt jelenti, hogy a napi jegyzet útvonalon az egyetlen új, tartalmi gate a secret scanner. A secret scanner credentialöket keres, nem instruction-shaped támadószöveget. Az audit M3 lánca ezért továbbra is működik:

1. külső tartalom eltéríti vagy befolyásolja a dreamet;
2. a dream instruction-shaped szöveget ír a napi jegyzetbe;
3. a provenance gate nem jelez, mert nincs flag;
4. a secret scan nem talál credentialt;
5. a teljes, keretezetlen napi jegyzet bekerül a `weekly-review` modellkontextusába.

Ez ellentmond a specifikáció azon kijelentésének, hogy Tables A és B „actually close M3”. Table B csak a dream reportokra vonatkozik.

**Concrete recommendation:** vagy kerüljön code-owned, per-line framing a snapshot napi-jegyzet slice-ára, vagy a napi jegyzetek kerüljenek ki ebből a WP-ből, és a specifikáció mondja ki, hogy M3 csak a report-ágon javul, de összességében nyitva marad. M3-at nem szabad lezártnak jelölni, amíg a heti review napi-jegyzet útvonala csak secret scanre és egy távoli promptmondatra támaszkodik.

---

## Finding 2 — Egy második, ugyanazon napi futás `false` bélyeggel újra engedélyezheti a korábban tainted reportot

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 232
- **line_end:** 247
- **confidence:** 0.99
- **impact:** High

A report fájlneve napi szintű: `<date>.md`. Table B minden futáskor új blokk prependezését írja elő, és a blokk után változatlanul a fájl korábbi első byte-ja következik.

Valós hibaútvonal:

1. Az első napi futás tainted inputot kap, ezért a report első stampje `true`.
2. A report body tainted szöveget tartalmaz.
3. Ugyanezen a napon új futás indul tiszta `expectedScratch` inputtal.
4. A specifikáció szerint az új futás `false` blokkot prependez a meglévő fájl elé.
5. `parseNoteResult()` csak a legelső frontmatter blokkot értelmezi.
6. A snapshot így trustednek látja a reportot, miközben annak body-ja továbbra is tartalmazhatja az előző, tainted futás szövegét.

A konkrét parserpróba azt is igazolta, hogy kétszeres stampnél az első blokk irányít. Ez egyben közvetlen ellentmondás az acceptance criterion „exactly one code-owned block” követelményével.

**Concrete recommendation:** a spec definiáljon idempotens stamp-életciklust. Egy meglévő, pontosan felismerhető code-owned vezető blokkot cserélni kell, nem újabbat elé írni. Ezen felül az új érték nem lehet `false`, ha a megmaradó report body korábbi `true` futásból származhat. Biztonságos lehetőség például:

- az effektív érték a korábbi stamp és az aktuális futás taintjének OR-ja; vagy
- minden futás teljesen új, aktuális inputból létrehozott report body-t épít; vagy
- egyedi per-run report készül a napi, összevont fájl helyett.

---

## Finding 3 — A csonkolás eltávolíthatja a `tool_result` bizonyítékát, miközben a belőle származó assistant-szöveg megmarad

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 237
- **line_end:** 241
- **confidence:** 0.97
- **impact:** High

A stamp kizárólag a végső scratch extract `messages` tömbjében megmaradt `role === 'tool_result'` elemek OR-ja.

A transcript intake azonban a legújabb üzeneteket tartja meg. A `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js:28-69` csonkolás eldobhat régebbi üzeneteket, miközben a későbbi assistant-üzenet megmarad. Ugyanez a mintázat létezik a message-count capnél is.

Reális eset:

1. egy `tool_result` külső támadószöveget tartalmaz;
2. az assistant ezt összefoglalja vagy visszaidézi;
3. a csonkolás eldobja az eredeti `tool_result` üzenetet;
4. az assistant összefoglaló megmarad és a dream inputja lesz;
5. a report ebből a szövegből készül;
6. a stamp mégis `false`, mert a megmaradt extractban már nincs `tool_result`.

Ez nem parser-fidelity probléma: a parser helyesen osztályozhatta az eredeti üzenetet, majd egy későbbi lépés elvesztette a provenance bizonyítékát.

**Concrete recommendation:** a transcript parser vagy a csonkolás előtti extract számítson code-owned, sticky run/input taint bitet, és ez a bit maradjon meg minden csonkolás után. Egyszerűbb fail-closed megoldásként minden olyan extract, amely csonkolt és amelyről nem bizonyítható, hogy a kidobott prefix tiszta volt, tegye `true` értékűvé a report stampet.

---

## Finding 4 — A uniform parser szabályos Markdownot és szabályos Obsidian/YAML frontmattert is kizár

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 211
- **line_end:** 224
- **confidence:** 1.00
- **impact:** Medium-High

A `parse()` nem YAML parser. Egy leading `--- … ---` blokk minden nem lapos `key: value` sorát malformednak jelöli. Ez security-bearing identity note esetén tudatos fail-closed szabály, de Table A most minden fájl minden slice-ára kiterjeszti.

A futtatott próbák két jelenleg renderelhető, legitim alakot kizártak:

```markdown
---
Dream report prose
---
body
```

Ez szabályos Markdown thematic-rule használatként renderelhető, de `malformed`.

```yaml
---
tags:
  - work
---
body
```

Ez szabályos YAML/Obsidian frontmatter, de szintén `malformed`.

A specifikáció mérése csak a jelenlegi header-shape-et, illetve egy későbbi `---` blokkot próbált. Nem próbálta az első byte-nál kezdődő thematic rule-t vagy szabályos, nested/list YAML-t. A következmény az, hogy korábban működő napi jegyzetek eltűnhetnek a heti review-ból, illetve egy legitim model-authored report eltűnhet a daily digestből.

**Concrete recommendation:** ne alkalmazza feltétel nélkül az identity-note célra tervezett szigorú flat-frontmatter parser malformed döntését minden snapshot fájlra. A reportoknál a gate csak a code-owned stamp pontos alakját ismerje el; a napi jegyzetekhez pedig legyen explicit kompatibilitási döntés és acceptance criterion legalább a szabályos YAML-listákra, valamint a leading Markdown thematic-rule alakra. Ha ezek kizárása tudatos termékdöntés, azt migrációs és felhasználói hatással együtt kell leírni.

---

## Finding 5 — A prepend nincs crash-safe módon specifikálva, és a következő dream futás legitim user editként commitolhatja a félkész állapotot

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 242
- **line_end:** 246
- **confidence:** 0.91
- **impact:** High

A stamp meglévő report elé írása read-modify-write műveletet igényel. A spec nem követel atomikus cserét, és nem ad recovery postconditiont.

A jelenlegi sorrendben a report módosítása a végső `git add -A` és commit előtt történik. Ha a folyamat a prepend vagy az append után leáll:

- a report részben felülírt vagy megcsonkított állapotban maradhat;
- a validation körül nincs olyan általános recovery blokk, mint a brain futtatása körül;
- a következő dream indulás előtt a `precommitSessionEdits()` minden dirty vault változást user session editként commitol.

Így egy félbehagyott stampírás vagy reportcsonkítás legitim pre-dream commitba kerülhet. Ez report-adatvesztést, hamis provenance értéket vagy befejezetlen enforcement reportot tehet tartóssá.

**Concrete recommendation:** Table B követelje meg:

1. a report teljes új byte-sorozatának memóriában történő elkészítését;
2. ugyanabban a könyvtárban, privát móddal létrehozott temp fájlt;
3. flush/close utáni atomikus rename-et;
4. a validation bármely hibája esetén a working tree HEAD-re visszaállítását;
5. olyan acceptance tesztet, amely a stampírás és a commit közötti megszakítást szimulálja, és igazolja, hogy a következő futás nem commitolja user editként a félkész reportot.

---

## Finding 6 — Table D teljes enumerációja jó, de a „minden érték named neutralizeren megy át” univerzális állítása hamis

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 261
- **line_end:** 273
- **confidence:** 1.00
- **impact:** Medium-High

A `digest.js` alapján az enumeráció teljes:

1. durable alerts;
2. Active projects;
3. transcript quarantine banner;
4. staged-output quarantine banner;
5. identity-exclusion banner;
6. scheduler-status line;
7. insecure-modes count;
8. update-available line.

A biztonsági állítás azonban nem igaz. A `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js:819-822` ezeket közvetlenül illeszti a prefixbe:

- `opts.quarantineLine`
- `opts.schedulerLine`
- `opts.updateLine`

A digest render site ezeket opaque, már formázott stringként kapja, és nem futtat rajtuk a Table D-ben megnevezett neutralizert. Konkrét counterexample:

- a transcript-quarantine banner basenameje `displayName`-on megy át, de a hozzá tartozó ledger `reason` raw stringként kerül a bannerbe;
- a scheduler-status line job neve szintén raw interpoláció a renderelt stringben, és a digestben nincs rá named neutralizer.

Ez akkor is cáfolja a byte-exact bulletet, ha a jelenlegi normál producerek code-owned vagy előzetesen validált értéket adnak. A bullet kifejezetten azt állítja, hogy a render site és a felsorolt neutralizerek biztosítják a tulajdonságot; a kód ehelyett producer-oldali, teljesen formázott stringekben bízik.

**Concrete recommendation:** vagy strukturált adatokat kapjon a `renderDigest`, és minden dinamikus mezőt maga neutralizáljon, vagy Table D szűkítse az állítást a ténylegesen ellenőrzött mezőkre és nevezze meg az upstream validatorokat is. A jelenlegi „every value” és „ONLY through” szavak nem maradhatnak.

---

## Finding 7 — Table E Correction 1 egy helyesen szűkített ADR-mondatot állít hamisnak

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 275
- **line_end:** 285
- **confidence:** 0.99
- **impact:** Medium

Az ADR-0032 tényleges mondata:

> `renderDigest` is the single chokepoint for the daily `## Summary`, so every consumer of its output … inherits the fence.

Az „of its output” megszorítás lényegi. A snapshot nem `renderDigest` outputot fogyaszt; közvetlenül a teljes daily note-ot másolja. Ezért a snapshot létezése nem cáfolja azt az állítást, hogy a `renderDigest` outputjának minden fogyasztója örökli a fence-et.

A specifikáció Correction 1 szövege elveszíti ezt a megszorítást, majd úgy kezeli az ADR-t, mintha az minden daily Summary útvonalra univerzális állítást tett volna. A hivatkozás létező sorokra mutat, de a jellemzés pontatlan.

**Concrete recommendation:** az amendment ne „hamis állítás korrekciójaként” írja le ezt. Helyette rögzítse az új felismerést: `renderDigest` továbbra is chokepoint a digest route-on, de a teljes napi jegyzetnek van egy második, snapshot route-ja, amely nem örökli az ADR framing mechanizmusát.

---

## Finding 8 — A specifikáció saját byte-exact és verification contractjai nem teljesíthetők együtt

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 279
- **line_end:** 503
- **confidence:** 1.00
- **impact:** High

Három konkrét hiba van.

### 1. Két eltérő „byte-exact” amender line

Table E ezt írja elő:

> `... narrowed to the route renderDigest actually controls ...`

A verification heredoc ezt keresi:

> `... narrowed to the digest path ...`

Egy implementáció nem tudja egyszerre mindkét eltérő byte-exact contractot teljesíteni.

### 2. Az „untouched tree green” állítások hamisak

Az ADR numstat gate:

```bash
test "$(git diff --numstat main -- file | cut -f2)" = 0
```

Untouched fájlnál a command substitution üres string, nem `0`, ezért a gate **exit 1**. A specifikáció mégis greennek állítja.

A THREAT-MODEL `1 7` numstat gate szintén **exit 1** untouched tree-n, miközben a both-directions table greennek jelöli az untouched állapotot.

### 3. A specifikáció már most elbukik a saját kötelező lintjén

`npm run lint` **exit 1** két MD038 hibával a specifikáció `98` és `244` sorában. Emiatt a Definition of Done szerinti kötelező green állapot a specifikáció változtatása nélkül eleve elérhetetlen.

**Concrete recommendation:** egységesítsék az amender line egyetlen kanonikus byte-sorára; javítsák a numstat gate-eket úgy, hogy explicit kezeljék az üres diffet vagy ne állítsák greennek az untouched állapotot; tegyék ténylegesen futtathatóvá a Table D literal gate-et; és javítsák a két markdownlint hibát a design elfogadása előtt.

---

## Tanulság

- **WP-gate-vault-snapshot:** Egy run-level provenance flag nem számítható kizárólag az aktuális, már csonkolt extractokból, ha a napi report több futás tartalmát őrizheti meg; a report életciklusát és a csonkolás előtti taintet együtt kell specifikálni.

## Ship assessment

**NO-SHIP — a napi-jegyzet M3 útvonal továbbra is nyitott, a report stamp downgrade-elhető, és a spec verification contractja önellentmondó.**

- Kezdeti `git status --porcelain`: `""` — exit 0
- Végső `git status --porcelain`: `""` — exit 0
- A két eredmény byte-identical.
`````
