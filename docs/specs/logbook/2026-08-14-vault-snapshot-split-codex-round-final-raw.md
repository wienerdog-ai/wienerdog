# Adversarial design review — final, on the owner-signed tree

WP: WP-gate-vault-snapshot
Backend: gptsol | subagent transcript agent-adfee97d5b34d1c1e.jsonl
Raw final output, byte-unchanged inside the fence. Recovered from the session transcript and
committed unadjudicated, per docs/runbooks/codex-review.md ("Rules").

`````text
# Eredmény: NO-SHIP

A hét új ellenőrző parancs a specifikáció iránytáblája szerint működik, a tulajdonosi ADR-aláírás nem törte el őket, és a mode-`000` fájl valóban `EACCES` hibával megszakítja a rutin összeállítását. Két lényegi szerződéshiba maradt azonban: az unbounded read mellett nem tartható a „no gate throws” univerzális állítás, továbbá egy UTF-8 BOM megkerüli a notes-slice provenance gate-et.

## Végrehajtott ellenőrzések

### Kiinduló állapot

```text
git rev-parse HEAD                                      exit 0
b12448d5c0d2584dad4588523ce2298ace4a070d

git branch --show-current                               exit 0
wp/gate-vault-snapshot

git status --porcelain=v1                               exit 0
<0 byte>
```

A branch diffje `main...HEAD` között kizárólag az öt várt dokumentációs fájlt érinti. Az explicit `file:line` hivatkozások automatikus tartományellenőrzése `exit 0` eredményt adott; minden hivatkozott sor létezik. A lényegi hivatkozások tartalmát külön is ellenőriztem a tényleges forrásfájlokban.

### Branch tesztjei

| Parancs | Exit | Eredmény |
|---|---:|---|
| `npm test -- --test-name-pattern "vault-snapshot"` | 0 | 103 pass |
| `npm test -- --test-name-pattern "routine-runtime"` | 0 | 111 pass |
| `npm test` | 0 | 1972 pass, 9 skip, 0 fail |
| `npm run lint` | 0 | markdownlint és frontmatter check pass |

A lint futásban a `shellcheck` nem futott, mert nincs telepítve; a PSScriptAnalyzer szintén kimaradt, mert nincs `pwsh`. Ezt a lint saját kimenete jelezte.

### A hét új gate a branchen

Sorrend:

1. `main` baseline guard
2. ADR deletion-count gate
3. ADR amender-line gate
4. ADR amendment-heading gate
5. THREAT-MODEL old-string-absent gate
6. THREAT-MODEL numstat gate
7. neutralizer-existence gate

```text
Branch as handed over:  [0, 0, 1, 0, 1, 1, 0]
Expected by spec:       [0, 0, 1, 0, 1, 1, 0]
```

Minden sor egyezik a specifikáció iránytáblájával.

### Kézzel felépített finished state `/tmp` alatt

A `/tmp/wienerdog-wp-finished` klónban felépítettem a Table A/B/C/D szerinti befejezett állapotot, beleértve egy új `tests/unit/vault-snapshot.test.js` fájlt.

| Parancs | Exit | Eredmény |
|---|---:|---|
| `npm --prefix /tmp/wienerdog-wp-finished test -- --test-name-pattern "vault-snapshot"` | 0 | 106 pass, benne 3 új snapshot gate teszt |
| `npm --prefix /tmp/wienerdog-wp-finished test -- --test-name-pattern "routine-runtime"` | 0 | 112 pass |
| `npm --prefix /tmp/wienerdog-wp-finished test` | 0 | 1975 pass, 9 skip, 0 fail |
| `npm --prefix /tmp/wienerdog-wp-finished run lint` | 0 | pass, ugyanazzal a két hiányzó opcionális lint-réteggel |
| Hét új gate | mind 0 | finished-state GREEN |
| Snapshot contract harness | 0 | secret, provenance, report exemption, UTF-8, EACCES, scan-error result, all-gated-out |
| Mount-framing harness | 0 | framing pontosan egyszer, csak mounted snapshotnál |
| Single-read/byte-identity harness | 0 | egy source read, a másolt Buffer byte-identikus |
| Budget-accounting harness | 0 | gated-out fájl nem fogyaszt byte budgetet |

Az ADR tulajdonosi státusza végig:

```text
Status: **ACCEPTED — OWNER-SIGNED 2026-08-14.**
```

A signed státusz mellett mind a hét finished-state gate zöld maradt.

### Deliberate break ellenőrzések

| Törés | Elvárt piros gate | Exit |
|---|---|---:|
| Egy meglévő ADR-sor törlése | ADR deletion count | 1 |
| Amender sor törlése | amender-line | 1 |
| 2026-08-14 amendment heading törlése | heading gate | 1 |
| Régi THREAT-MODEL szöveg visszahelyezése | old-string gate | 1 |
| Egy másik THREAT-MODEL sor módosítása | numstat gate | 1 |
| `renderAlertField` átnevezése `renderAlertFieldBROKEN` névre | neutralizer gate | 1 |
| Single-branch klón local `main` nélkül | baseline guard | 1 |

A THREAT-MODEL helyes, egysoros alternatív átfogalmazása mellett mind a hét gate zöld maradt.

### További reprodukciók

- Mode-`000` source:
  - `makeVaultSnapshot`: `THROW code=EACCES syscall=open`
  - `composeRoutineRun`: `THROW code=EACCES syscall=open`
  - reprodukciós harness exitje: `0`
- Dokumentált read-path hibák a jelenlegi branchen:
  - `lstat` után 262145 byte-ra nőtt fájl cap felett másolódik;
  - post-`lstat` symlink swap külső fájlt másol;
  - symlinkelt source directory külső fájlt enumerál és másol;
  - harness: `exit 0`
- A finished-state dual-failure sorrend:
  - malformed + secret note esetén `scan_calls=0`;
  - skip reason: `provenance gate: malformed`;
  - harness: `exit 0`
- Deliverables boundary:
  - minden felsorolt deliverable és a logbook path: `exit 0`;
  - nem listázott `src/core/not-listed.js`: `exit 1`.
- `parseNoteResult` mért eredményei pontosan egyeznek a specifikáció táblájával:
  - report, false, empty → `null`;
  - true → `untrusted-exact`;
  - YAML list/nested/prose block → `malformed`;
  - harness: `exit 0`.

## Findings

### Finding 1 — Az unbounded read mellett hamis a „no gate throws” garancia

- `file`: `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- `line_start`: 256
- `line_end`: 256
- `confidence`: 0.99
- `impact`: High

A Table A azt állítja, hogy „No gate throws”, az acceptance criterion pedig megismétli, hogy a gate-ek nem szakítják meg a futást. Ugyanez a specifikáció szándékosan meghagyja az unbounded `readFileSync`-et és a `lstat`→read növekedési ablakot.

A kézzel felépített finished state-ben olyan reprodukciót futtattam, amelyben:

1. a `lstat` által látott méret 1 byte volt;
2. az egyetlen read 536,870,889 byte-os Buffert adott vissza;
3. a Buffer mérete egy byte-tal meghaladta a futó Node `MAX_STRING_LENGTH` értékét;
4. `bytes.toString('utf8')` `ERR_STRING_TOO_LONG` hibát dobott;
5. a hiba kijutott `makeVaultSnapshot`-ból, nem keletkezett `skipped[]` bejegyzés.

```text
THROW code=ERR_STRING_TOO_LONG name=Error
```

Ez nem a read descriptor lifecycle újranyitása. A probléma az, hogy a specifikáció univerzális hibagaranciát állít egy olyan feldolgozási láncról, amelynek erőforráskorlátait kifejezetten a következő WP-re halasztotta. A Buffer létrehozása vagy a decode ennél kisebb fájlnál is okozhat memóriahibát; ezt egy egyszerű `readFileSync`-catch nem fedi le.

- `concrete_recommendation`: Szűkítsék a Table A és az acceptance criterion állítását a ténylegesen garantált esetekre: filesystem read errors → `unreadable`, scanner-degraded result → secret skip, invalid UTF-8 round-trip → UTF-8 skip. A decode/allocation/resource failure kerüljön név szerint Residual 7-be a queued bounded-read WP-ig. Alternatívaként specifikálni kell a decode-hibák determinisztikus skip contractját, de az unbounded allocation mellett továbbra sem szabad univerzális „no gate throws” garanciát tenni.

### Finding 2 — Egy UTF-8 BOM megkerüli az explicit `derived_from_untrusted: true` jelölést

- `file`: `/Users/felho/dev/repos-to-learn-from/wienerdog/docs/specs/WP-gate-vault-snapshot.md`
- `line_start`: 249
- `line_end`: 249
- `confidence`: 0.99
- `impact`: Medium

A specifikáció azt ígéri, hogy a notes slice-on az explicit `derived_from_untrusted: true` kizárja a fájlt. Az előírt implementáció azonban kötelezően a jelenlegi `parseNoteResult(text)` függvényt használja.

A tényleges parser csak akkor ismer fel frontmattert, ha a string első sora byte-for-byte `---`. Egy érvényes UTF-8 BOM megmarad `U+FEFF` karakterként, ezért a következő fájl Gate 1-en átmegy, de a parser „nincs frontmatter” állapotnak tekinti:

```text
<U+FEFF>---
derived_from_untrusted: true
---
attacker-derived body
```

A finished-state reprodukció eredménye:

```text
parse exclusion=null
snapshot copied=true skipped=[]
```

Tehát a fájl byte-faithful UTF-8, explicit módon `true` jelölést hordoz, mégis bemásolódik a `weekly-review` snapshotjába. Ez közvetlenül ellentmond a lines 443–446 acceptance criterionnek, és gyengíti azt az állítást is, hogy a provenance gate automatikusan életre kel majd, amikor egy jövőbeli write-back path elkezdi feltenni ezt a flaget.

- `concrete_recommendation`: A közös parser contractban kezeljenek pontosan egy leading UTF-8 BOM-ot a frontmatter opener előtt, és ugyanazt a parser-fixet használja a digest és a snapshot. Mivel ez digest-owned, jelenleg nem deliverable, ezért ezt vagy előfeltételként/külön WP-ként kell kezelni, vagy a mostani specifikáció garanciáját kell leszűkíteni „parser-recognized leading frontmatter”-re, a BOM-os és hasonló opener-shape-eket pedig explicit fail-open residualként dokumentálni.

## Záró állapot

```text
Initial git status --porcelain: exit 0, output = <0 byte>
Final   git status --porcelain: exit 0, output = <0 byte>
Byte comparison: identical
```

**NO-SHIP:** a mechanikai gate-ek megfelelően működnek, de a „no gate throws” túlgarancia és a BOM-os provenance bypass javítás vagy explicit owner-accepted residual nélkül nem engedi biztonsággal `Ready` állapotba tenni a specifikációt.
`````
