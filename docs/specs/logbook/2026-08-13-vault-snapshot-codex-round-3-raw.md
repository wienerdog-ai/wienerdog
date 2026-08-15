# Adversarial design review round 3 — pre-ruling draft

WP: WP-gate-vault-snapshot
Backend: gptsol | subagent transcript agent-a5adb9a81b1d2d6a0.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
# Eredmény

**NO-SHIP.** A 2. kör hat megállapításából négy valóban javítva van, egy csak részben, egy pedig a szöveges javítás ellenére új megvalósíthatósági blokkolót hagyott maga után. Emellett az új raise-only mechanizmusban tényleges provenance-megkerülés van: egy második, azonos napi dream futás visszaminősítheti az előző futás `true` bélyegét `false` értékre.

A repository read-only maradt. A kezdő és záró `git status --porcelain` egyaránt üres, byte-identikus.

---

## Végrehajtott ellenőrzések

### Repository-állapot

```text
git -C /Users/felho/dev/repos-to-learn-from/wienerdog status --porcelain
exit 0
output: <empty>

git -C /Users/felho/dev/repos-to-learn-from/wienerdog branch --show-current
exit 0
output: wp/gate-vault-snapshot

git -C /Users/felho/dev/repos-to-learn-from/wienerdog rev-parse HEAD
exit 0
output: f0bc173fd6f0b141d3f7b986a7f1a87e8611a3f8
```

### Forrás- és hivatkozás-ellenőrzések

Elolvastam és a hivatkozott sorokon ellenőriztem többek között:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/runbooks/spec-authoring.md`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/claude.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/codex.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/vault-snapshot.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/routine-runtime.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/ledger.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/scheduler/status.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/cli/dream.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/THREAT-MODEL.md`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/adr/0032-daily-summary-untrusted-fence.md`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/skills/wienerdog-dream/SKILL.md`

A parser viselkedését közvetlen Node futtatással is reprodukáltam:

```text
parseNoteResult_type=function
current=null
truth=untrusted-exact
falsev=null
adjacent=untrusted-exact
list=malformed
nested=malformed
thematic=malformed
exit 0
```

### Re-measure

A maintainer aktuális transcript-korpuszán lefuttattam a tényleges parsereket, a per-message capet, a 2000-message capet, valamint egy 8 000 000 byte-os, naptári napok szerint csoportosított water-filling futásmodellt.

```text
node /tmp/wienerdog-r3-measure.js
exit 0
```

Eredmény:

| Mérőszám | Eredmény |
|---|---:|
| Felfedezett transcript | 10 118 |
| Parse-olható extract | 9 927 |
| `tool_result` jelen van | 8 928 / 9 927 = **89,94%** |
| `truncated === true` | 9 642 / 9 927 = **97,13%** |
| Régi `truncated OR tool_result` szabály | 9 792 / 9 927 = **98,64%** |
| Per-message text cap | 9 642 / 9 927 = **97,13%** |
| 2000-message cap miatti dobás | 157 / 9 927 = **1,58%** |
| Parser-szintű jelzett üzenetdobás | 56 / 9 927 = **0,56%** |
| Finomított szabály, water-filling előtt | 8 933 / 9 927 = **89,99%** |
| Plausible daily run | 140 |
| Tüzelő plausible run | 138 / 140 = **98,57%** |
| Water-filling után etetett extract | 8 883 |
| Ezek közül tüzelő extract | 7 969 / 8 883 = **89,71%** |
| Water-filling miatt üzeneteket vesztő extract | 4 737 |

A „plausible run” itt következtetés, nem történeti run-ledger: az extractokat helyi mtime szerinti naptári napokra csoportosítottam, majd a jelenlegi alapértelmezett 8 000 000 byte-os water-filling szabályt alkalmaztam.

### Tesztek

```text
npm test -- --test-name-pattern "vault-snapshot"
exit 0
103 passed, 0 failed

npm test -- --test-name-pattern "routine-runtime"
exit 0
111 passed, 0 failed

npm test
exit 0
1981 tests, 1972 passed, 0 failed, 9 skipped

npm run lint
exit 0
markdownlint: 0 errors
frontmatter: passed
```

A lint-verdict részleges: a parancs sikeres volt, de a helyi környezetben a `shellcheck` és a PSScriptAnalyzer nem futott, mert a binárisok nem voltak telepítve. Ez nem érinti a mostani markdown-only design review fő megállapításait.

### Kilenc verification gate

Az érintetlen fán:

| Gate | Exit | Elvárt |
|---|---:|---|
| ADR numstat = 0 | 0 | green |
| ADR amender line | 1 | red |
| PROPOSED line | 1 | red |
| THREAT-MODEL old string absent | 1 | red |
| THREAT-MODEL new bullet present | 1 | red |
| THREAT-MODEL numstat `1 7` | 1 | red |
| Neutralizers exist | 0 | green |
| `parseNoteResult` present | 1 | red |
| Identifier absent | 0 | green |

A `/tmp/wienerdog-r3-clone` throwaway clone-ban minden megadott red-direction mutáció a várt non-zero státuszt adta. A kézzel felépített finished állapotban, szabadon átírt ADR-amendment prózával, mind a kilenc gate exit 0 lett.

**A táblázat egyik megadott iránya sem hibás.** Viszont a `parseNoteResult` gate egy nem felsorolt, reális hibás állapotra hamisan zöld: egy kommentben szereplő `parseNoteResult` szó elég a sikerhez.

---

# Part 1 — A 2. kör megállapításainak státusza

## 1. A truncation szabály az extractok körülbelül 98,64%-án tüzelt

**Verdict: PARTIALLY FIXED**

A spec már helyesen különválasztja:

- a teljes üzenetek elvesztését;
- az egy üzeneten belüli text capet.

A korábbi `truncated OR tool_result` szabály helyett csak a message-dropping és a `tool_result` tüzelne.

A javítás azonban nem implementálható a jelenlegi Deliverables-határon belül. Az `expectedScratch` extractben csak a végső `messages` és az összemosott `truncated` érték van. Az eredeti üzenetszám, a message-count drop és a water-filling drop külön ténye már elveszett. A szükséges jel csak a nem engedélyezett `src/core/transcripts/index.js` vagy `src/core/dream/scratch.js` módosításával vihető át megbízhatóan.

Ezen felül a finomított szabály még mindig az extractok **89,99%**, a plausible runok **98,57%** részén tüzel.

## 2. A „code-owned block shape” állítás hamis volt

**Verdict: FIXED**

A spec most kifejezetten kimondja, hogy a model pontosan ezt a blokkformát is meg tudja írni, és a forma nem bizonyít code-ownershipöt. Ez valódi korrekció, nem átnevezés.

Az erre épített asymmetry-következtetés viszont hibás; ezt külön finding részletezi.

## 3. Az atomic rename temp fájlt hagyhatott, amelyet a következő precommit commitol

**Verdict: FIXED a round-2 finding szintjén**

A spec most mindkét szükséges védelmet előírja:

1. `finally` cleanup ugyanabban a futásban;
2. fix, code-owned temp név vagy minta, amelyet a következő futás a `precommitSessionEdits` előtt eltávolít.

Ez a `validate.js` Deliverables-határon belül megvalósítható úgy, hogy a cleanup a már ott definiált `precommitSessionEdits` elején történik.

Nem találtam szükségszerű ütközést:

- a scratch-integrity check kizárólag a scratch könyvtárat járja;
- az out-of-vault ellenőrzés a brain által írt vault diffet vizsgálja;
- a quarantine és redacted utak a `state/` alatt vannak, nem a report melletti temp helyen.

Külön probléma marad, hogy a későbbi report-appendek nem atomikusak; ezt egy másik finding tárgyalja.

## 4. Table D hamisan zárt enumként kezelte a quarantine reasont és descriptor-owned scheduler-neveket állított

**Verdict: FIXED**

A Table D most pontosan rögzíti, hogy:

- `activeQuarantines` a ledgerből olvasott `reason` értéket nem validálja újra a writer által használt halmaz ellen;
- a scheduler név a `describeEntry` által, validált scheduler-entry basename-ből származik;
- ismeretlen scheduler-entry esetén `describeEntry` `null` értéket ad.

Ez egyezik az aktuális forrással.

## 5. A neutralizer gate prefix alapján elfogadta az átnevezett függvényt

**Verdict: FIXED**

Az új regex:

```text
function $fn *\(
```

nem fogadja el a `renderAlertFieldBROKEN(` alakot. A throwaway clone-ban végzett átnevezés exit 1-et adott.

## 6. A spec azt állította, hogy a dream secret gate sosem vizsgálja a reportot

**Verdict: FIXED**

A spec most pontosan különválasztja:

- EP2 megvizsgálja az adott futás által staged added line-ként hozzáadott model-report sorokat;
- nem vizsgálja a Step 4-ben később hozzáfűzött enforcement/redaction részeket;
- nem vizsgálja újra a teljes korábban commitolt reportot;
- a snapshot gate lesz az első consumer-side whole-file scan.

Ez egyezik a `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:1178-1232` és `:1341-1375` kóddal.

---

# Findings

## Finding 1 — A model-written `false` képes visszaminősíteni egy korábbi `true` stampet

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 277
- **line_end:** 280
- **confidence:** 0.99
- **impact:** High — tainted report trustedként kerülhet a snapshotba

A spec csak ezt az egyenletet elemzi:

```text
model false OR this-run true = true
```

Ez valóban nem engedi a modelnek az aktuális futás `true` eredményét levinni. A többfutásos sorrendet azonban nem védi.

Konkrét escape:

1. Az első, azonos napi futás tainted inputból reportot ír.
2. A code stampje `true`.
3. A report commitolódik.
4. Ugyanazon a napon indul egy második dream.
5. A model írhatja ugyanazt a reportfájlt, mert a skill kifejezetten erre utasítja.
6. A model a vezető `true` blokkot `false` blokkra cseréli, miközben a korábbi tainted bodyt meghagyja.
7. A második futás saját számított értéke lehet `false`.
8. A validator a model által átírt jelenlegi fájlból olvassa vissza a „prior” értéket.
9. `false OR false` eredménye `false`.
10. `parseNoteResult` trustedként kezeli a fájlt, így a korábbi tainted body eléri a snapshotot.

A spec ezért tévesen állítja, hogy „a forged `false` cannot lower anything” és „an escape is impossible”. A forged `true` hatása sem csak „its own” report: az azonos dátumú fájl korábbi futások reporttartalmát is elnyomhatja.

**Konkrét recommendation:** a raise-only prior értéket ne a brain futása után model-writable working-tree fájlból olvassa vissza a kód. A pre-brain, commitolt állapotból vagy a brain indítása előtt rögzített baseline-ból kell származtatni. A végső érték legalább:

```text
trusted pre-brain prior OR this-run computed value
```

legyen. A model által utólag írt blokkot nem szabad prior authorityként kezelni.

---

## Finding 2 — A message-dropping tény nem származtatható az `expectedScratch` tartalmából a megengedett fájlhatáron belül

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 268
- **line_end:** 272
- **confidence:** 1.0
- **impact:** High — a Table B egyik load-bearing biztonsági feltétele nem implementálható a WP scope-jában

A tényleges adatfolyam:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js:152-181`:
  - a text cap és a 2000-message cap ugyanazt a `truncated` booleant állítja;
  - a message-count cap után csak a levágott `messages` tömb marad.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js:36-69`:
  - a water-filling truncation további teljes üzeneteket dob;
  - a scratch extractben ismét csak `truncated: true` és a végső tömb marad.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js:199-223`:
  - a `truncatedToFit` külön tény csak az `entries` metadata részébe kerül;
  - a production `validateAndCommit` kizárólag `sel.wrote`, vagyis scratch pathok tömbjét kapja.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:1103-1109`:
  - a validator a már veszteséges scratch JSON-t olvassa vissza.

A final extractből nem lehet eldönteni, hogy például:

- eredetileg pontosan 2000 üzenet volt, és csak text cap történt;
- vagy eredetileg 2001 üzenet volt, és egy teljes üzenetet is eldobtak.

A source transcripthez való visszanyúlás sem korrekt derivation: `source_path` bounded/pseudonymized lehet, a source időközben változhat, és a validator már nem rendelkezik az eredeti parsing state-tel.

A Deliverables tábla nem engedi módosítani sem:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/transcripts/index.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/scratch.js`
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/cli/dream.js`

**Konkrét recommendation:** egészítse ki a Deliverables táblát a producer oldali fájlokkal, és vigyen át külön, code-owned jelet, például `messages_dropped: true|false` értéket mind a parser/count-cap, mind a water-filling útból. Ezt a végső scratch extractben kell megőrizni. A „derive it” alternatívát törölni kell, mert a jelenlegi consumer-inputból nem lehetséges.

---

## Finding 3 — A finomított szabály továbbra is gyakorlatilag mindig kiéhezteti a `daily-digest` rutint

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 352
- **line_end:** 371
- **confidence:** 0.97
- **impact:** High — a routine az esetek döntő többségében elveszíti az egyetlen snapshot-inputját

A finomítás a corpus extract-szintű firing rate-jét csak:

```text
98,64% → 89,99%
```

értékre csökkenti.

A plausible daily runoknál az „ANY transcript fires” OR miatt az eredmény:

```text
138 / 140 = 98,57%
```

A `daily-digest` pontosan egy reportot kap. Ha annak stampje tüzel, a snapshot üres. A finomított szabály ezért nem teszi ritkává az exclusiont; gyakorlatilag ugyanaz a product failure marad, mint amely miatt a döntés korábban parkolásra került.

A water-filling előtti 89,99%-os eredményt szinte teljesen a `tool_result` 89,94%-os gyakorisága dominálja. A message-dropping/text-capping szétválasztása tehát technikailag helyes, de a termék-életképességi problémát nem oldja meg.

**Konkrét recommendation:** az exclusion vs label+warn+inherit döntést még implementáció előtt újra kell nyitni. A spec ne szállítsa „interim” állapotként az exclusiont anélkül, hogy az owner kifejezetten elfogadná a mért, körülbelül 98,6%-os run-level starvationt.

---

## Finding 4 — Az atomicity acceptance criterion nem teljesíthető úgy, hogy a későbbi appendek változatlanok maradnak

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 281
- **line_end:** 284
- **confidence:** 0.96
- **impact:** Medium-High — interrupted run részleges reportot hagyhat, amelyet a következő futás user editként commitol

A spec előírja, hogy a stamp rewrite atomic legyen, de egyidejűleg azt is mondja, hogy a későbbi report-writes változatlan `appendFileSync` hívások maradnak.

Az acceptance criterion később ennél erősebbet állít:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:511-513`: a stamp write és commit közötti interruption után vagy a régi, vagy a teljes új report maradjon, soha ne részleges.

A tényleges sorrend:

- stamp;
- enforcement append: `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:1355-1358`;
- opcionális redaction append: `:1372-1375`;
- végső `git add -A`.

Egy kill az enforcement append után, de a redaction append előtt már logikailag részleges új reportot hagy. A következő futás `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/dream/validate.js:122-136` útja ezt user session editként commitolhatja. A stamp atomikus cseréje ezt nem védi.

**Konkrét recommendation:** a teljes végső reportot — stamp, korábbi body, enforcement és redaction részek — memóriában kell összeállítani, majd egyetlen same-directory temp+rename művelettel lecserélni. Alternatívaként az acceptance criteriont szűkíteni kell kizárólag a leading-block rewrite-ra, és a későbbi append-interruption residualt külön, őszintén meg kell nevezni. A jelenlegi két állítás együtt nem tartható.

---

## Finding 5 — A provenance-reuse verification gate kommenttel vagy dead reference-szel hamisan zöld

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 585
- **line_end:** 588
- **confidence:** 1.0
- **impact:** Medium — a security-load-bearing gate újraimplementált vagy egyáltalán nem hívott provenance ellenőrzéssel is átmehet

A gate csak ezt futtatja:

```text
grep -q "parseNoteResult" src/core/vault-snapshot.js
```

A throwaway finished state-ben kizárólag ezt a kommentet tettem a fájlba:

```text
// parseNoteResult is reused by the finished implementation.
```

A gate exit 0 lett, miközben sem import, sem hívás nem létezett. A másik grep csak a `derived_from_untrusted` identifier előfordulását tiltja; nem bizonyítja, hogy a shared parser ténylegesen lefut a copied Buffer szövegén.

Ez ugyanaz a false-green problémaosztály, amelyet a neutralizer regex a 2. kör után már kijavított.

**Konkrét recommendation:** a grep helyett viselkedési gate vagy AST nélküli, de importot és call site-ot egyaránt ellenőrző célzott vizsgálat kell. A legerősebb bizonyíték egy teszt, amely stubból vagy tényleges malformed/untrusted inputból igazolja, hogy a snapshot kimenete a shared `parseNoteResult` viselkedésével együtt változik. Komment vagy fel nem használt import ne lehessen elég.

---

# Part 2 további verdictjei

## Stale-temp mechanizmus

**Alapvetően sound**, ha:

- a temp név kizárólag a report-stamper fenntartott neve;
- a cleanup a `precommitSessionEdits` első git-status vizsgálata előtt történik;
- a same-run cleanup `finally` ágban van;
- a temp létrehozása nem követ pre-existing symlinket.

A scratch-integrity, out-of-vault és quarantine utak önmagukban nem ütköznek vele. A teljes report atomicity azonban külön nyitott probléma marad.

## Kilenc both-directions gate

A táblázat minden megadott green/red iránya reprodukálható volt. Egyetlen megadott deliberate break sem maradt zöld.

A `parseNoteResult` gate ettől még hiányos, mert a táblázatban nem szereplő komment/dead-reference break hamis zöldet ad.

---

# Part 3 — Spec-authoring discipline

A spec jelenleg **667 soros**. A fő authoring-problémák nem pusztán stílusbeli megjegyzések; a fenti ellentmondások kialakulásához járulnak hozzá.

- A `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/runbooks/spec-authoring.md:7-14` tiltja a test designokat és mutation listeket. A spec `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:590-615` része mégis pontos red-direction mutációkat és futtatási protokollt ír elő.
- A mérésnél a runbook egy provenance sort kér, nem teljes measurement protocolt. A spec `:352-371` implementációs mérési eljárást és értelmezési szabályokat is előír.
- Ugyanazok a tények többször szerepelnek a Current state, Table B, Implementation notes, Security checklist és Acceptance criteria részekben. A „forged false cannot lower” állítás így több helyen erősíti ugyanazt a hibás következtetést.
- A message-dropping contract önmagában részletes, de nem self-contained a permission boundary szempontjából: olyan producer-side változtatást igényel, amelynek fájljai nincsenek a Deliverables között.
- A universális állítások többségének van acceptance criterion vagy named table fogyasztója. A legsúlyosabb ungated universal a Residual 7 „escape is impossible” állítása, amelyet sem többfutásos invariant, sem hitelesített prior state nem támaszt alá.

**Konkrét recommendation:** a következő design round előtt a specet vissza kell húzni a canonical contract-táblákra, a permission boundaryre és az observable acceptance criteria-ra. A red-mutation recepteket, történeti mérési protokollt és többszörös residual-restatementeket el kell távolítani. A többfutásos stamp invariantot és a producer→scratch provenance mezőt egy-egy önálló, ellenőrizhető contractként kell megfogalmazni.

---

# Ship assessment

**NO-SHIP.**

Blokkolók:

1. a raise-only mechanizmus többfutásos `true → false` provenance escape-et enged;
2. a message-dropping jel nem áll elő a jelenlegi Deliverables-határon belül;
3. a mért finomított szabály a plausible runok **98,57%-án** továbbra is kiéhezteti a `daily-digest` egyetlen inputját;
4. az atomic report acceptance criterion ellentmond a változatlan append útvonalnak.

---

## Repository status — előtte és utána

```text
BEFORE git status --porcelain:
<empty>

AFTER git status --porcelain:
<empty>
```

```text
before SHA-256:
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

after SHA-256:
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

cmp exit:
0
```

A két státusz byte-identikus; a repository alatt sem fájlmódosítás, sem létrehozás, sem törlés nem történt.
`````
