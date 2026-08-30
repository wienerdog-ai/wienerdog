# Adversarial design review round 2 — spec revised to the ruling

WP: WP-gate-vault-snapshot
Backend: gptsol | subagent transcript agent-a49a51d240c54d5ea.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
## Eredmény

**NO-SHIP.** A Round 1 négy megállapításából három teljesen javított. A descriptor-alapú olvasási szerződés azonban csak részben javított: POSIX-on megszünteti a konkrét újranyitási versenyeket, de nem ír elő ténylegesen korlátos olvasást, nem rendezi teljesen a descriptor életciklusát, és Windows alatt a megkövetelt `O_NOFOLLOW` nem érhető el.

## Végrehajtott ellenőrzések

### Repository és tesztek

| Parancs | Exit | Eredmény |
|---|---:|---|
| `git status --porcelain=v1` az elején | 0 | 0 bájt, tiszta |
| `git branch --show-current && git rev-parse HEAD` | 0 | `wp/gate-vault-snapshot`, `17f344d53f0f14cb08c9c0e2456bf23e31114197a` |
| `npm test -- --test-name-pattern "vault-snapshot"` | 0 | 103 fájl-wrapper pass; ezen a még csak design branchön nem futott új snapshot-teszt |
| `npm test -- --test-name-pattern "routine-runtime"` | 0 | 111 pass, benne 9 tényleges `routine-runtime` teszt |
| `npm test` | 0 | 1981 teszt; 1972 pass, 0 fail, 9 skip |
| `npm run lint` | 0 | markdownlint és frontmatter pass; shellcheck és PSScriptAnalyzer nem volt telepítve, ezért a lint saját szabálya szerint kihagyta őket |
| Exact-HEAD throwaway clone-os line-range ellenőrzés | 0 | minden ellenőrzött `file:line` hivatkozás létezett és a hivatkozott tartalmat fedte |
| `git status --porcelain=v1` a végén | 0 | 0 bájt, tiszta |

A célzott `vault-snapshot` parancs jelenleg nem bizonyít snapshot-viselkedést: a kimenetben csak a tesztfájl-wrapper sorok jelentek meg, snapshot nevű tesztesetek nem. A teljes `npm test` ettől függetlenül ténylegesen lefutott.

### A hat új gate

| Állapot | ADR numstat | Amender line | Heading | Old string absent | Threat numstat | Neutralizers |
|---|---:|---:|---:|---:|---:|---:|
| Átadott branch | 0 | 1 | 0 | 1 | 1 | 0 |
| Kézzel felépített kész állapot | 0 | 0 | 0 | 0 | 0 | 0 |
| ADR meglévő sora törölve | 1 | 0 | 0 | 0 | 0 | 0 |
| Teljes amendment section törölve | 0 | 0 | 1 | 0 | 0 | 0 |
| Threat model más sora is módosítva | 0 | 0 | 0 | 0 | 1 | 0 |
| `renderAlertField` átnevezve | 0 | 0 | 0 | 0 | 0 | 1 |
| Amender line eltávolítva | 0 | 1 | 0 | 0 | 0 | 0 |
| Régi threat-model szöveg visszaállítva | 0 | 0 | 0 | 1 | 1 | 0 |
| Owner aláírta az amendmentet | 0 | 0 | 0 | 0 | 0 | 0 |
| Single-branch clone, nincs helyi `main` | 1 | 1 | 0 | 1 | 1 | 0 |

Minden, a specifikáció táblájában megadott irány helyes. Az owner aláírása nem tesz pirossá egyetlen gate-et sem.

### Platform- és fájlrendszer-ellenőrzések

| Parancs / reprodukció | Exit | Eredmény |
|---|---:|---|
| Helyi Node 24/macOS `fs.constants.O_NOFOLLOW` ellenőrzés | 0 | létezik, értéke `256` |
| Letöltött Node 18.20.8/macOS ellenőrzés | 0 | létezik, értéke `256` |
| macOS leaf symlink megnyitása `O_NOFOLLOW`-val | 0 | `ELOOP`, tehát a leaf symlink visszautasítva |
| macOS symlinkelt ancestor directory alatti leaf megnyitása | 0 | az ancestor symlink követve, külső tartalom olvasható |
| Node 18 hivatalos `fs.json` dokumentáció ellenőrzése | 0 | Windows elérhető open flag listája nem tartalmazza az `O_NOFOLLOW`-t |
| `undefined` flag bitwise OR reprodukció | 0 | `O_RDONLY \| undefined` eredménye `0`; a védelem csendben eltűnhet |
| Linux Node 18 Docker ellenőrzés | 1 | nem futott: a Docker CLI elérhető, de a daemon nem futott |
| Symlinkelt `07-Daily` source root reprodukció | 0 | külső `.md` bekerült, `skipped: []`; cél 0700/0600 és stagingen belül maradt |
| Code-owned `spec.dir` célútvonal-ellenőrzés | 0 | mindhárom slice célja a snapshot root alatt maradt |
| Crafted fájlnév ellenőrzés | 0 | slash nem lehet directory-entry név; newline lehet, de nem okoz path traversalt |

A Linux runtime-próbát tehát nem tudtam lefuttatni. A Linux `O_NOFOLLOW` leaf-only viselkedésére az operációs rendszer dokumentációját ellenőriztem; ezt nem számítom végrehajtott Linux-tesztnek.

---

## Part 1 — Round 1 megállapítások

### 1. Path `lstat`, majd újranyitás; cap- és leaf-symlink megkerülés

**Verdikt: PARTIALLY FIXED**

A specifikáció valóban nem egyszerűen átnevezi a régi lépéseket:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:238-240` egyetlen descriptorhoz köti az `open` → `fstat` → read → gate → copy láncot.
- A tényleges bájtszámot `buf.length` alapján kell könyvelni.
- A post-check leaf-symlink swap POSIX-on már nem irányíthatja át az olvasást: a már megnyitott descriptor ugyanarra a fájlobjektumra mutat.
- A `fstat` után túl nagyra növő fájlt a specifikáció szerint nem szabad másolni.

Nem teljes javítás, mert:

1. a szerződés előbb végigolvashatja a növekvő fájlt, és csak utána ellenőrzi a capet;
2. Windows alatt nincs Node által elérhető `O_NOFOLLOW`;
3. nincs teljes descriptor-close és fstat/read-error szerződés.

Ezeket az alábbi findingok részletezik.

### 2. Scheduler job name közvetlenül a cache-ből

**Verdikt: FIXED**

A reworded Table C most pontosan leírja a valós határt:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/scheduler/status.js:235-267` a cache-ből származó `e.name` értéket idézőjelek között, de neutralizer nélkül interpolálja.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/digest.js:819-824` a már formázott `schedulerLine` értéket csak összefűzi.
- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:275-277` már nem állít basename-validációt a render útvonalon; kifejezetten kimondja, hogy newline digest sort hamisíthat.

Ez valódi tartalmi korrekció.

### 3. Az aláíratlan ADR amendment nem volt completionhöz kötve

**Verdikt: FIXED**

`/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md:604-613` explicit merge preconditionné teszi az owner-aláírást. Az amendment státusza jelenleg valóban `PROPOSED`:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/adr/0032-daily-summary-untrusted-fence.md:155-200`

A kézzel felépített aláírt állapotban mind a hat gate zöld maradt.

A merge-vs-dispatch indoklás megalapozott. A korábbi precedensben a régi normatív döntés közvetlenül az eltávolítandó block fence újraépítésére utasította volna az implementert:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/done/WP-daily-summary-per-line-framing.md:288-293`

A mostani aláíratlan amendment nem mond ellent a Table A vagy Table B implementációjának. A régi ADR legfeljebb túl széles megnyugtatást és stale future-WP állítást tartalmaz; nem misdirektálja a descriptoros gate vagy mount framing megvalósítását. Ezért dispatch helyett merge precondition elfogadható.

### 4. ADR deletion gate helyi `main` nélküli clone-ban zöld lett

**Verdikt: FIXED**

A branch nélküli baseline-próba most explicit fail-closed:

- helyi `main` nélküli single-branch clone-ban az ADR gate `exit=1`;
- üzenete: `no baseline ref 'main'`;
- valódi ADR-törlésnél szintén `exit=1`;
- untouched/add-only ADR-nél `exit=0`.

---

## Findings

### Finding 1

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 237
- **line_end:** 240
- **confidence:** 0.99
- **impact:** High

**Mi romolhat el**

Egy fájl, amely a `fstat` pillanatában legfeljebb 256 KiB, utána korlátlanul nőhet. A jelenlegi szerződés előírja a descriptor teljes olvasását, majd csak a létrejött `Buffer.length` alapján utasítja el. Így a másolási cap ugyan megmarad, de a memória- és futásidő-cap nem.

**Miért sérülékeny**

A Position row szerint az over-cap fájl „never read into memory”, de a következő két row kifejezetten a teljes, ténylegesen beolvasott Buffer utólagos vizsgálatát írja le. Ha az implementer `fs.readFileSync(fd)`-t használ, az EOF-ig olvas. Egy gyorsan növő fájl ezért jóval 256 KiB fölé nőhet azelőtt, hogy a kód egyáltalán eljutna a `buf.length` ellenőrzéséig.

Ez nem pusztán stale stat kérdés. A specifikáció saját, deklarált resource boundját teszi utólagos policy checkké.

**Valószínű következmény**

Egy ugyanazon felhasználó által párhuzamosan írt vault-fájl nagy memóriahasználatot, hosszú blokkolást vagy process-kilövést okozhat. A routine nem jut el a látható skipig, tehát a „skip visibly, never fail the run” viselkedés sem garantált.

**Konkrét ajánlás**

A descriptoros olvasást nevezetten korlátozni kell:

- legfeljebb `MAX_FILE_BYTES + 1` bájt olvasható egy fájlból;
- a read loop vagy helper ugyanazt az egy descriptort használja;
- „exactly one read” helyett „one descriptor-bound byte acquisition, no path reopen” legyen a szabály, mert robusztus `readSync` használat részleges olvasás miatt több syscallt igényelhet;
- a `+1` bájt jelzi az over-cap állapotot anélkül, hogy a teljes fájlt memóriába töltené;
- az acceptance criterion mérje azt is, hogy a read oldal sosem allokál vagy fogyaszt a bound fölött, ne csak azt, hogy a túl nagy Buffer végül nincs kimásolva.

### Finding 2

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 238
- **line_end:** 252
- **confidence:** 1.0
- **impact:** High

**Mi romolhat el**

A specifikáció minden támogatott platformra előírja az `O_NOFOLLOW` open-t és azt állítja, hogy a leaf-symlink refusal eredménye változatlan marad. Windows alatt Node 18 nem teszi elérhetővé az `O_NOFOLLOW` flaget.

**Miért sérülékeny**

A projekt más része explicit win32 támogatást szállít, miközben a WP általánosan Node ≥18-ra szól. A Node 18 hivatalos dokumentációja szerint Windows alatt csak az alábbi releváns open flagek érhetők el: `O_APPEND`, `O_CREAT`, `O_EXCL`, `O_RDONLY`, `O_RDWR`, `O_TRUNC`, `O_WRONLY`, `UV_FS_O_FILEMAP`; `O_NOFOLLOW` nincs köztük.

A repository meglévő portability mintája:

- `/Users/felho/dev/repos-to-learn-from/wienerdog/src/core/private-fs.js:680-684`

`fs.constants.O_NOFOLLOW || 0`-ra esik vissza. Ha az implementer ezt követi, a flag csendben nullává válik. A reprodukcióban `O_RDONLY | undefined` is `0` lett. Ez nem fail-closed.

**Valószínű következmény**

A WP vagy:

- futásidőhibával leáll Windows alatt;
- csendben követi a leaf symlinket/junctiont;
- vagy visszaáll check-then-open viselkedésre, amelyen a Round 1 verseny továbbra is megmarad.

Mindhárom ellentmond a platformfüggetlen „outcome unchanged” állításnak.

**Konkrét ajánlás**

A specifikációnak explicit Windows-szerződést kell választania:

1. **fail closed:** Windows alatt ne készítsen snapshotot, ha a no-follow invariáns nem valósítható meg;
2. **owner-approved reduced posture:** tartsa meg az `lstat`-alapú statikus symlink/junction refusal-t, de nevezze meg, hogy a concurrent swap elleni garancia csak POSIX-on áll;
3. vagy engedjen platform-native megoldást, ami jelenleg összeütközne a zero-dependency/pure-Node korláttal.

Az `O_NOFOLLOW || 0` vagy bitwise coercion nem lehet elfogadott fallback.

### Finding 3

- **file:** `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- **line_start:** 238
- **line_end:** 249
- **confidence:** 0.96
- **impact:** Medium

**Mi romolhat el**

Az `open` sikerülhet, majd az `fstat`, read vagy későbbi write hibát dobhat. A szerződés nem követeli meg, hogy a descriptor minden ilyen útvonalon bezáródjon, és nem mondja meg, hogy az `fstat`/read hiba hogyan kerül az existing `unreadable` skipbe.

**Miért sérülékeny**

Node-ban az `fs.readFileSync(fd)` nem zárja be a hívó által átadott descriptort; ezt helyben végrehajtva ellenőriztem. Tehát az implementernek explicit `finally` ágra van szüksége. A Table A részletesen előírja az open, fstat, read, gate és copy sorrendjét, de a close sehol nincs a szerződésben vagy az acceptance criteria között.

A „No gate throws” criterion nem fedi le az `fstat` és descriptor-read hibákat: azok a gate-ek előtt történnek.

**Valószínű következmény**

Tranziens fájlrendszerhiba abortálhatja az egész routine compositiont ahelyett, hogy látható `unreadable` skipet adna. A descriptor a process élettartamáig nyitva maradhat. Egy futásban a mai tervek legfeljebb 14 fájlt érintenek, ezért ez nem önmagában tömeges descriptor exhaustion, de a routine egészének hibája user-visible regresszió.

**Konkrét ajánlás**

A Table A írja elő:

- `fd` minden sikeres open után `finally` blokkban, pontosan egyszer bezárandó;
- close hiba ne fedje el az eredeti read/fstat hibát;
- open/fstat/read hiba az existing `unreadable` skip reasonhöz vezessen, ne dobja el az egész snapshotot;
- acceptance criterion és fault-injection teszt fedje külön az `open`, `fstat`, read és close hibákat.

---

## Residual 7 ellenőrzése

A symlinkelt source directory valóban követve van. A reprodukcióban egy vaulton kívüli `2026-08-14.md` bekerült a weekly snapshotba `skipped: []` mellett.

A specifikáció szűkebb boundja POSIX-on egyébként helyes:

- a directory targetból enumerált leaf továbbra is átmegy a `.md` szűrőn;
- a leaf `O_NOFOLLOW` csak a leafet védi, az ancestor symlinket szándékosan nem;
- a code-owned `spec.dir` értékek mind a snapshot root alatt maradnak;
- directory-entry név nem tartalmazhat path separatort, ezért crafted filename nem tud `path.join` traversalt létrehozni;
- newline lehet fájlnévben, de ettől a célút nem kerül stagingen kívülre;
- a reprodukált célkönyvtárak 0700, a célfájl 0600 lett;
- a mirrored layout megmaradt.

Ezért Residual 7 önmagában nem ad új findingot. A „whatever is enumerated goes through Table A” állítás azonban Windows alatt csak akkor igaz biztonsági értelemben, ha Finding 2 rendezve van.

## Table C teljes ellenőrzése

A felsorolt nem-vault forrásokat mindkét production call site-on végigkövettem:

- alerts: `renderAlertField` mind a négy mezőn;
- Active projects: `sanitizeProjectName`;
- transcript quarantine: `displayName` a basename-re, de raw cache `reason` marad — Table C ezt már bevallja;
- staged-output quarantine: `listSecretQuarantine`, majd második whitelist a renderben;
- identity exclusion: fixed file/reason készlet;
- scheduler status: cache name neutralizer nélkül — Table C ezt már bevallja;
- insecure modes: numerikus count;
- update line: validált semver és két fixed command;
- `renderDigest` a quarantine/scheduler/update line-okat már formázva kapja és csak összefűzi.

Nem találtam a reworded bullet által elhallgatott új production counterexample-et. A „minden érték bounded” mondat túl széles nyitás, de ugyanazon sor azonnal és konkrétan megnevezi a két kivételt; ez nem indokol külön ship-blocking findingot.

## Spec-authoring fegyelem

A 617 soros, `size: M` specifikáció már túl van azon a méreten, amit egy implementer biztonságosan egyben tud tartani. Konkrét eltérések a runbooktól:

- implementation structure előírása: pontos syscalls, boolean plan property és sorrend;
- test-design előírása: konkrét frontmatter-osztályok, race-mutationök, fault esetek;
- ugyanazon tény többszöri újramondása a Context, Current state, Table A, Security checklist és Acceptance criteria részekben;
- több univerzális állítás csak későbbi bekezdésben kap kivételt.

Ez nem külön finding, mert a materializálódott következményeit a három finding már konkrétan lefedi. Viszont a Finding 1 és Finding 2 éppen azt mutatja, hogy a nagy részletmennyiség nem eredményezett teljes szerződést: az olvasás boundja és a Windows-platformhatár elveszett benne.

## Ship assessment

**No-ship.** A scheduler-, ADR- és baseline-gate javítások rendben vannak, és a hat új gate a megadott irányokban működik. A snapshot fő biztonsági szerződése viszont még nem platformteljes és nem garantál téngesen korlátos descriptoros olvasást.

## Repository státusz

- **Előtte:** `git status --porcelain` = üres, 0 bájt
- **Utána:** `git status --porcelain` = üres, 0 bájt
- **Byte-identical:** igen

### Sources

- [Node.js 18 File System documentation](https://nodejs.org/docs/latest-v18.x/api/fs.html#file-open-constants)
- [Linux `open(2)` manual](https://man7.org/linux/man-pages/man2/open.2.html)
- [Apple `open(2)` manual](https://keith.github.io/xcode-man-pages/open.2.html)
`````
