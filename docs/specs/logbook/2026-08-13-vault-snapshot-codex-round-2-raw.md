# Adversarial design review round 2 — pre-ruling draft

WP: WP-gate-vault-snapshot
Backend: gptsol | subagent transcript agent-acf088c732ebb9a4e.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
## Végrehajtott ellenőrzések

- `git branch --show-current && git rev-parse HEAD` — exit 0  
  - ág: `wp/gate-vault-snapshot`
  - HEAD: `cbca2f53fd9de7dae84a46094df6a6fca4b8476e`
- Kezdő `git status --porcelain` — exit 0, kimenet: üres
- `npm test -- --test-name-pattern "vault-snapshot"` — exit 0, 103 pass
- `npm test -- --test-name-pattern "routine-runtime"` — exit 0, 111 pass
- `npm test` — exit 0, 1972 pass, 9 skip, 0 fail
- `npm run lint` — exit 0:
  - markdownlint: 0 hiba
  - frontmatter: pass
  - shellcheck: nem futott, mert nincs telepítve
  - PSScriptAnalyzer: nem futott, mert nincs telepítve a PowerShell
- A specifikáció mind a kilenc új kapuját lefuttattam az érintetlen fán. Exit státuszok:
  - ADR numstat: 0
  - ADR amender line: 1
  - PROPOSED status: 1
  - THREAT-MODEL old string absent: 1
  - THREAT-MODEL new bullet present: 1
  - THREAT-MODEL numstat: 1
  - neutralizers exist: 0
  - `parseNoteResult` present: 1
  - `derived_from_untrusted` absent: 0
- A piros irányokat egy `/tmp/wienerdog-design-review-r2` alatti ideiglenes klónban futtattam. Az előírt törésre minden kapu piros lett, egy kivétellel: a neutralizer-kapu prefix-alapú átnevezésnél hamisan zöld maradt.
- A transcript-mérést a gépen jelenleg felfedezhető 10 118 transcripten futtattam. 9927 sikeresen parse-olható extractből:
  - `truncated === true`: 9642, azaz 97,13%
  - tartalmaz `tool_result` üzenetet: 8928, azaz 89,94%
  - a Table B jelenlegi OR-szabálya szerint tüzelne: 9792, azaz 98,64%
- `rg`-vel és közvetlen fájlolvasással ellenőriztem a specifikáció `file:line` hivatkozásait. Mechanikusan feloldhatatlan hivatkozást nem találtam. Egy feloldódó hivatkozásból levont állítás viszont tényszerűen hibás: a dream report modell által írt része már ma is bekerül a Step 3 staged-output secret scanbe.
- Záró `git status --porcelain` és bájtszintű `od` ellenőrzés — exit 0, kimenet: üres.

## Part 1 — Round 1 javítások

### 1. A daily-note ág nyitva marad, miközben a spec M3 lezárását állítja

**FIXED.**

A specifikáció már kifejezetten részleges lezárásként írja le az eredményt:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:420-432`
- Kimondja, hogy a report ág lezárul, a daily-note ág nem.
- A PR számára is megtiltja M3 teljesen megoldottként való jelölését.

Ez érdemi szerződésváltozás, nem puszta átfogalmazás.

### 2. A második aznapi run `false` értékkel visszaminősítheti az első run tainted reportját

**FIXED.**

A raise-only OR szabály ezt a konkrét hibát lezárja:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:271-272`
- A korábbi `true` és az aktuális érték OR-ja kerül kiírásra.
- A blokkot helyben kell cserélni, nem egymásra halmozni.

Az új „code-owned block” felismerésnek külön problémája van, de az eredeti same-day downgrade megszűnik.

### 3. A truncation ledobhatja a `tool_result` üzenetet, miközben a belőle származó assistant-szöveg megmarad

**FIXED.**

A specifikáció minden `truncated === true` extractet fail-closed módon taintednek tekint:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:263-265`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js:152-181`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js:36-69`

A jel valós és elérhető a scratch-fájlokban. Az új szabály gyakorlati használhatóságával kapcsolatban azonban van egy súlyos új finding alább.

### 4. Valid YAML-list frontmatter és leading thematic rule `malformed` lesz

**NOT FIXED.**

A viselkedés változatlanul fennáll. A specifikáció most dokumentálja és elfogadott residualként kezeli:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:127-151`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:408-419`

Ez jobb disclosure, de nem javítás. A valid YAML-listás daily note továbbra is kimarad a weekly review inputjából.

### 5. A stamp prepend nem crash-safe

**PARTIALLY FIXED.**

A célfájl torn write problémáját a same-directory temp + rename megoldja:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:273`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:478-480`

A szerződés azonban nem rendezi a crash után a vaultban maradó temp fájlt, amelyet a következő run `precommitSessionEdits` lépése user editként commitolhat. Ez külön finding alább.

### 6. Table D azt állította, hogy minden nem Wienerdog-érték render-site neutralizeren megy át

**FIXED az eredeti finding tekintetében.**

Az új szöveg kifejezetten kimondja, hogy a quarantine, scheduler és update sorok már formázva érkeznek, ezért ott a producer az enforcing surface:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:298-302`

Az új replacement bullet más állításai között azonban van két tényszerű hiba; lásd Finding 4.

### 7. Correction 1 egy szó szerint igaz ADR-mondatot nevezett hamisnak

**FIXED.**

A Table E most „new realization” formában rögzíti a második útvonalat, és nem nevezi hamisnak az eredeti, `renderDigest` outputjára korlátozott mondatot:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:312`

### 8. Két eltérő byte-exact amender sor, hibás numstat irány, két MD038 hiba

**FIXED.**

- Egyetlen kanonikus amender sor van.
- A heredoc ugyanazokat a bájtokat tartalmazza.
- Az ADR numstat használja a `${ADR_DEL:-0}` defaultot.
- Az érintetlen fán a numstat kapu zöld.
- `npm run lint` 0 markdownlint hibával végzett.

## Parts 2–3 — Findings

### Finding 1 — A modell által írható blokk nem lehet hitelesen „code-owned”

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 270
- **line_end:** 272
- **confidence:** 0.99
- **impact:** High availability / provenance-integrity risk

A specifikáció szerint egy leading frontmatter blokk code-ownednak számít, ha az egyetlen kulcsa `derived_from_untrusted`, és az érték pontos boolean. Ugyanakkor a dream modell kifejezetten írhatja a reportot:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/skills/wienerdog-dream/SKILL.md:409-425`

Semmi nem akadályozza meg abban, hogy pontosan ezt a blokkot írja a report első bájtjaira. A „That shape is code-written and nothing else produces it” állítás ezért hamis.

A felvetett `false` támadás nem képes egy aktuálisan `true` code-computed értéket visszaminősíteni, mert `true OR false === true`. A modell viszont írhat előre `true` értéket. A raise-only olvasás ezt hiteles korábbi code-owned értékként fogadja el, így egy egyébként clean run reportját is kizárhatja a snapshotból.

Ha a modell ugyanezt a blokkot nem a fájl elejére írja, az nem befolyásolja a provenance parse-t; ordinary body text marad. Ha a szerződés szerint implementálják a prepend/replace szabályt, a valódi stamp továbbra is első marad. A probléma az, hogy a leading blokk eredete nem állapítható meg a formájából.

**Concrete recommendation:** a korábbi raise-only értéket ne a modell által írható working-tree reportból olvassa vissza a rendszer. Tárolja code-owned state-ben a vaulton kívül, vagy adja át a brain indulása előtt rögzített, hiteles baseline-ból. Az aktuális modell-outputban található azonos alakú blokkot modell-contentként kell kezelni, nem korábbi code-owned állapotként.

---

### Finding 2 — A truncation-szabály a jelenlegi corpuson gyakorlatilag minden reportot kizárna

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 263
- **line_end:** 265
- **confidence:** 0.98
- **impact:** High product availability; a daily digest memóriaforrása szinte mindig eltűnhet

A `truncated` mező valóban elérhető a `expectedScratch` által hivatkozott extractekben. Nemcsak whole-message vagy message-count eldobás állítja be:

- egy 4000 karakternél hosszabb egyedi üzenet csonkolása is `truncated = true`;
- oversized record eldobása is beállítja;
- message-count cap is beállítja;
- water-filling truncation szintén beállítja.

Források:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js:97-109`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js:152-181`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js:199-223`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/cli/dream.js:557-566`

A gépen jelenleg felfedezhető, sikeresen parse-olt 9927 extract 97,13%-a truncated. A `truncated OR has tool_result` szabály 98,64%-nál tüzelne. Ez transcript-szintű mérés; a run-szintű „bármely transcript” OR csak tovább növeli a tüzelési valószínűséget.

A specifikáció előírt mérése mégis csak a `tool_result` arányt kéri:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:343-353`

Ez kihagyja a tényleges döntési szabály domináns ágát. A daily-digest egyetlen snapshot-inputja a legújabb report, ezért ez valószínűleg nem ritka fail-closed eseményt, hanem közel állandó memória-éhezést okozna.

Ez a spec-authoring szabályt is sérti: a specifikáció részletes mérési protokollt ír elő, miközben a döntés tényleges inputját nem méri.

**Concrete recommendation:** a report-exclusion viselkedés elfogadása előtt mérjék a tényleges `truncated OR tool_result` szabályt a valós run-csoportosítással. Különítsék el azokat a truncation okokat, amelyek elveszíthették a provenance bizonyítékát, az egyszerű per-message text cap eseteitől. A 98,64%-os transcript-szintű jel alapján a parkolt exclusion-vs-label döntést implementáció előtt, nem utána kell újranyitni.

---

### Finding 3 — Az atomikus rename mellett is maradhat commitolható temp fájl a vaultban

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 273
- **line_end:** 273
- **confidence:** 0.97
- **impact:** Medium–High data-integrity risk

A same-directory temp + rename megvédi a report célfájlt a félbeírástól. Viszont ha a folyamat a temp létrehozása után, rename előtt áll le, a temp fájl a Git-vaultban marad.

A következő dream run indulásakor:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:122-136`

a `precommitSessionEdits` minden dirty fájlt `git add -A` után user session editként commitol. Ez a spec által elkerülni kívánt crash-persistence probléma más fájlnéven továbbra is fennáll.

A repo meglévő, ugyanilyen in-vault temp megoldása explicit `finally` cleanupot tartalmaz, mert Step 5 mindent stage-el:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:788-870`

A `finally` a normál exceptionöket kezeli, de process kill után egy következő-run recovery cleanup továbbra is szükséges.

**Concrete recommendation:** a szerződés követelje meg mindkettőt:

1. `try/finally` cleanup minden write/rename hibára;
2. a `precommitSessionEdits` előtt code-owned temp névre szűkített stale-temp recovery, hogy egy korábbi crash maradványa ne lehessen user editként commitolva.

Ha a „minden interruption” állítás power-loss tartósságot is jelent, file- és directory-`fsync` követelmény is szükséges; különben az acceptance criteriont szűkíteni kell process interruptionre.

---

### Finding 4 — Table D két biztonsági állítása nem igaz a jelenlegi kódra

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 298
- **line_end:** 302
- **confidence:** 0.99
- **impact:** Medium trust-boundary documentation error; corrupt/forward-schema quarantine reason raw Markdownként kerülhet a digestbe

A replacement bullet szerint a quarantine reason „drawn from a closed enum”. Ez nem igaz:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/ledger.js:78-98` nem validálja az egyedi ledger recordokat.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/ledger.js:328-355` a reasont `String(rec.reason || 'unreadable')` formában továbbadja.
- A comment kifejezetten kimondja, hogy az unrecognized reason is bekerül a bannerbe.
- A reason sem allowlisten, sem Markdown/control-character neutralizeren nem megy át.

Ez nem csak dokumentációs pontatlanság: egy corrupt vagy forward-schema ledger reason newline-t és Markdown struktúrát vihet a digest control-plane bannerébe.

A scheduler job names állítás szintén pontatlan. A neveket nem „Wienerdog's own scheduler descriptors” szolgáltatják, hanem a manifestben szereplő scheduler-entry path validált basename-jéből deriválja a kód:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/scheduler/status.js:41-64`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/scheduler/generators.js:163-193`

A basename regex valóban `[a-z0-9-]` alakra korlátoz, tehát a biztonsági tulajdonság megvan, de a megnevezett eredet rossz.

**Concrete recommendation:** a byte-exact Table D szöveget ne landolják ebben a formában. Vagy:

- szűkítsék az állítást arra, hogy a normál producer-útvonalak ismert reason értékeket írnak, miközben unknown reason fallback/residual létezik; vagy
- vegyék scope-ba a ledger read/render validációját, és unknown reason esetén használjanak fix code-owned fallbacket.

A scheduler rész mondja ki pontosan, hogy a nevek validált Wienerdog scheduler-entry basename-ekből származnak.

---

### Finding 5 — A neutralizer verification gate prefix-alapú hamis zöldet ad

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 545
- **line_end:** 547
- **confidence:** 1.0
- **impact:** Medium verification-integrity risk

A kapu ezt keresi:

```sh
grep -rq "function $fn" src/
```

Az ideiglenes klónban a következő átnevezést próbáltam:

```text
function renderAlertField(...) → function renderAlertFieldBROKEN(...)
```

A kapu exit 0-val zöld maradt, mert a keresett szöveg prefixként továbbra is jelen volt. Ez közvetlenül cáfolja a both-directions tábla állítását, hogy egy átnevezés pirosra fordítja:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:568`

A kapu azt sem bizonyítja, hogy a függvény exportálva van vagy a megnevezett producer/render útvonal ténylegesen hívja.

A new-bullet gate ezenfelül önmagában nem futtatható: a verification blokk csak kommentben mondja, hogy a Table D szövegét manuálisan másolják `/tmp/wp-t1-bullet.txt` fájlba. A mostani futtatáshoz ezt külön, programozottan kellett előállítanom.

**Concrete recommendation:** használjanak határolt declaration checket, például olyan reguláris kifejezést, amely a függvénynév után `(` karaktert követel, és külön ellenőrizzék az exportot vagy a tényleges call site-ot. A bullet tempfájlt a verification blokk hozza létre determinisztikusan; ne manuális másolás legyen egy „literal verification command” előfeltétele.

---

### Finding 6 — A specifikáció tévesen állítja, hogy a dream reportot ma soha nem scan-eli a dream secret gate

- **affected_file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 94
- **line_end:** 112
- **confidence:** 0.99
- **impact:** Medium design-premise error; a már létező védelem „első alkalomként” kerül dokumentálásra

A specifikáció szerint a report csak az EP2 gate után kerül hozzáadásra, ezért „the dream's own secret gate never scans the report”. A Security checklist ugyanezt „first time ever” secret scannek nevezi:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:420-424`

A jelenlegi kód ezzel szemben Step 3 elején `git add -A`-t futtat, majd minden staged hozzáadott sort scan-el:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:1178-1236`

Ha a modell már létrehozta vagy módosította a dream reportot, annak modell által írt hozzáadott sorai is ebben a staged diffben vannak. Hard finding esetén a report revertelődik; Step 4 ezután hozza létre újra header-only formában, majd hozzáfűzi a code-owned enforcement részt:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:1341-1358`

A helyes különbség:

- a modell által ebben a runban hozzáadott report-sorokat az EP2 már scan-eli;
- a Step 4-ben később hozzáfűzött code-owned enforcement/redaction szakaszokat az EP2 már nem scan-eli;
- a snapshot scan a teljes committed fájlt vizsgálja, nem csak az aktuális run staged additions részét.

**Concrete recommendation:** javítsák a Current state és Security checklist állításait erre a pontos különbségre. A Table A snapshot scan továbbra is indokolható mint teljes-fájl consumer-side gate, de nem nevezhető a report első secret scanjének.

## További ellenőrzések, finding nélkül

- **Replace-in-place / stamp position:** ha az implementáció követi a szerződést, a stamp első marad. A modell által később írt hasonló delimiter ordinary body text, és nem befolyásolja `parseNoteResult` döntését.
- **Empty snapshot:** `makeVaultSnapshot` a plan létezésekor előbb létrehozza a snapshot directoryt, ezért minden candidate kizárása után non-null, üres directoryt ad vissza. `composeRoutineRun` ezt mountolja. A daily-digest és weekly-review skill egyaránt explicit graceful-degradation szabályt tartalmaz hiányzó/üres inputra.
- **Citations:** mechanikusan rossz `file:line` hivatkozást nem találtam. A report-secret-scan hivatkozás feloldódik, de a belőle levont következtetés hibás.
- **Table D eredeti render-site hibája:** a quarantine, scheduler és update sorok producer-side formázásának új leírása helyes.
- **Kilenc both-directions sor untouched-tree iránya:** mind a kilenc sor zöld/piros iránya megfelel a táblának. A neutralizer sor deliberate-red megvalósítása azonban nem megbízható minden átnevezésre.

- **WP-gate-vault-snapshot lesson:** a same-directory atomic rename a célfájlt védi, de a vaultban maradó temp fájlt külön kell megvédeni attól, hogy a következő run user editként commitolja.
- **WP-gate-vault-snapshot lesson:** a tényleges provenance OR minden ágát mérni kell; a csak `tool_result`-arányra korlátozott mérés elrejti, hogy a `truncated` ág önmagában a corpus 97%-án tüzel.

## Ship assessment

**NO-SHIP.** A jelenlegi szerződés közel állandó report-kizárást írhat elő, modell-authored adatot nevez code-ownednak, nem zárja le a stale-temp crash útvonalat, és tényszerűen hibás Threat Model szöveget követel.

- Kezdő `git status --porcelain`: üres
- Záró `git status --porcelain`: üres
- A két eredmény bájtszinten azonos.
`````
