---
title: Round 1 — external adversarial design review (raw), WP-dream-write-fence-control-files
date: 2026-08-20
---

<!-- markdownlint-disable -->
<!-- The verbatim reviewer body below is EVIDENCE and is never reformatted:
     a hard tab and bold-as-heading come from the reviewer, not from us. Same
     precedent as docs/runbooks/review-prompts/adversarial.md. -->

# Round 1 — external adversarial design review (raw)

Backend: `gptsol` agent (the repo's validated backend; see
`docs/runbooks/codex-review.md`, "Backend selection"). Reviewer instructions:
`docs/runbooks/review-prompts/adversarial.md`, verbatim, placeholders filled.
Spec under review at commit `bc650d4`. Review set and focus text as dispatched
(spec + the three Deliverables + the claimed-about code + the audit + the process
rules; `docs/marketing/`, `memory/`, `userreports/` and unrelated specs excluded).

Read-only proof: `git status --porcelain` was zero bytes before and after the
run, and the reviewer pasted both.

**Language note (process defect, not a review defect).** The reviewer replied in
Hungarian: the dispatching session's own language preference leaked into an agent
whose output becomes a repository artifact, and this repository requires English
file content. The output is committed VERBATIM anyway — the verbatim-raw rule is
what makes after-the-fact adjudication possible, and editing evidence to satisfy a
style rule would destroy exactly that property. The fix belongs in the dispatch:
future gate dispatches must pin the reviewer's output language to English. An
English index of the five findings precedes the verbatim body.

## English index of the findings (added by the orchestrator, not part of the raw)

| # | Finding | Reviewer severity / confidence |
|---|---|---|
| 1 | Same-run ignore bypass: reverting the dream's `.gitignore` un-hides a file the classification loop already passed over, and the later `git add -A` stages and commits it | Major / 1.0 |
| 2 | "Safe against user data" is false: a user file created during the run, or a previously-ignored user file un-hidden by a revert, is permanently deleted by the denial | Major / 1.0 |
| 3 | The git seam still runs repository-controlled programs (`core.fsmonitor` on `status`, `gpg.program` on a signing commit); the residual list names only filters | Major / 1.0 |
| 4 | Table C silently repoints a previously valid layout to a different directory on upgrade | Major / 0.99 |
| 5 | The idempotence criterion is unsatisfiable: the validator appends an enforcement section to the report on every run | Spec-blocking / 1.0 |

Verdict line: **NO-SHIP**.

## Verbatim reviewer output

---

**NO-SHIP — a specifikáció jelen formájában nem zárja le az M10-et, bizonyítható adatvesztési útvonalat vezet be, és az M9 Git-végrehajtási felületének több lényeges részét nem kezeli.**

## 1. Az ignore-szabály ugyanazon futáson belül megkerüli a teljes kontrollfájl-fence-et

- **Fájl:** `docs/specs/WP-dream-write-fence-control-files.md:175-192,252-263,293-296`
- **Érintett kód:** `src/core/dream/validate.js:1020-1033,1144-1209,1223-1232,1411-1440`
- **Súlyosság:** Major
- **Bizalom:** 1.0

**Mi romolhat el?**

Egy hostile dream ugyanabban a futásban létrehozhatja ezt a két fájlt:

1. `.gitignore`, amely ignorálja a `CLAUDE.md`-t;
2. `CLAUDE.md`, amely tartós hostile instrukciókat tartalmaz.

A klasszifikációs snapshot csak a `.gitignore`-t látja. A Table A visszavonja azt, de a későbbi `git add -A` ekkor már látja és stage-eli a korábban ignorált `CLAUDE.md`-t. A path-fence nem fut le újra, ezért a `CLAUDE.md` bekerül a dream commitba.

**Miért sérülékeny ez az útvonal?**

A `changedPaths()` egyszer, az aktuális ignore-szabályok mellett készít snapshotot. Az ezt követő revert megváltoztathatja, hogy Git mely fájlokat látja. A Step 3 és Step 5 újra lefuttatja a `git add -A` parancsot, de az újonnan látható fájlokat már csak a secret scan vizsgálja, a kontrollfájl-klasszifikáció nem.

A reprodukció eredménye:

```text
---CLASSIFIED---
?? .gitignore

---STAGED---
A	CLAUDE.md

---COMMIT---
CLAUDE.md
note.md
commit_exit=0
```

Ez közvetlenül cáfolja azt az állítást, hogy Rule 1 lezárja az ignore-generátort, és hogy a pre-existing user ignore entries az egyetlen M10-maradvány.

**Várható hatás**

A hostile instrukció tartósan commitolható, miközben az enforcement report nem említi. Ez az M7 és M10 kombinált megkerülése, és nem csak örökölt repository state mellett működik.

**Konkrét ajánlás**

A klasszifikáció bemenetét függetleníteni kell a Git ignore-állapotától. A brain előtt és után készüljön olyan filesystem-inventory, amely az ignorált fájlokat is látja, vagy minden ignore-szemantikát módosító revert után fusson újra a teljes változásfelderítés és klasszifikáció egy bizonyítottan konvergáló ciklusban. A végső `git add -A` előtt kötelező legyen igazolni, hogy minden stage-elt path átment a path-fence-en.

---

## 2. A „safe against user data" állítás hamis; a szabály meglévő vagy futás közben mentett felhasználói fájlt törölhet

- **Fájl:** `docs/specs/WP-dream-write-fence-control-files.md:185-192`
- **Érintett kód:** `src/core/dream/validate.js:122-137,660-667,1020-1033,1144-1153`
- **Súlyosság:** Major
- **Bizalom:** 1.0

**Mi romolhat el?**

Két konkrét adatvesztési útvonal van:

1. A user a brain futása közben létrehoz egy új `CLAUDE.md`-t. A validator `?? CLAUDE.md`-ként látja, brain-outputnak tekinti, és az előírt `revertPath(..., true)` törli.
2. A vaultban már létezik egy ignorált felhasználói fájl, például `.obsidian/workspace.json`. A precommit nem látja. Ha a dream eltávolítja az ignore-szabályt a tracked `.gitignore`-ból, a validator snapshotja egyszerre látja a módosított `.gitignore`-t és a korábban ignorált user fájlt. Rule 1 mindkettőt denyként kezeli, majd az untracked user fájlt végleg törli.

A második útvonal reprodukciója:

```text
---PRECOMMIT-STATUS---
(empty)

---VALIDATOR-SNAPSHOT---
 M .gitignore
?? .obsidian/workspace.json

user_data_exists_after_revert=no
```

A konkurens mentés reprodukciója:

```text
---STATUS-SEEN-BY-VALIDATOR---
?? CLAUDE.md

user_file_exists_after_revert=no
```

**Miért sérülékeny ez az útvonal?**

A precommit csak azt bizonyítja, hogy egy adott korábbi pillanatban a Git által látható tree tiszta volt. Nem bizonyítja:

- hogy az ignorált fájlok nem léteztek;
- hogy a user nem mentett a brain futása közben;
- hogy a klasszifikációkor látható minden új fájlt a brain hozott létre.

A kódbázis maga is felismeri ezt a konkurenciahelyzetet a secret-gate-ben: `src/core/dream/validate.js:1299-1303` külön védi azt az esetet, amikor a note tulajdonosa futás közben mentett.

**Várható hatás**

Felhasználói vault-adat végleg törlődhet commit és quarantine-copy nélkül. A `.obsidian/`, `.trash/` és más, szándékosan ignorált dot-directoryk kifejezetten érintettek.

**Konkrét ajánlás**

A specifikáció ne engedje untracked denied path feltétel nélküli törlését. A brain előtti inventory-nak az ignorált pathokat is tartalmaznia kell. Ha egy path már létezett, vagy a rendszer nem tudja bizonyítani, hogy kizárólag a brain hozta létre, a validator őrizze meg/quarantine-olja és szakítsa meg a futást. Futás közbeni user-editnél ugyanez a fail-preserve viselkedés szükséges. A „safe against user data" állítást addig el kell távolítani.

---

## 3. A Git-seam továbbra is repository-controlled programokat futtat; a residual lista nem teljes

- **Fájl:** `docs/specs/WP-dream-write-fence-control-files.md:194-205,282-292,308-320`
- **Érintett kód:** `src/core/dream/validate.js:67-84,91-106,122-135,1432-1440`
- **Súlyosság:** Major
- **Bizalom:** 1.0

**Mi romolhat el?**

A `core.hooksPath=/dev/null` és a `--no-verify` csak Git hookokat tilt. Más repository-controlled végrehajtási felületek tovább működnek:

- `core.fsmonitor` már egy `git status` során külső programot indít;
- `commit.gpgSign=true` és egy repository-local `gpg.program` külső programot indít a commit során, a `--no-verify` ellenére.

Mindkettőt reprodukáltam.

`core.fsmonitor`:

```text
ran:2 1787229308746378000
git_status_exit=0
```

`gpg.program`:

```text
ran:--status-fd=2 -bsau wienerdog <wienerdog@localhost>
fatal: failed to write commit object
commit_exit=128
```

**Miért sérülékeny ez az útvonal?**

A helper változatlanul a vault repository saját `.git/config`-ját és az ambient Git-konfigurációt használja. A `core.hooksPath` nem általános „safe Git mode"; kizárólag a hook-lookup helyét írja felül.

A specifikáció csak filtereket nevez meg residualként, a successor doctor pedig csak hookokat és filter-definíciókat tervez detektálni. A `core.fsmonitor`, a signing program és más executable Git config így sem védelem, sem disclosure alá nem kerül.

**Várható hatás**

Egy örökölt vagy később módosuló vault Git-config tetszőleges programot futtathat a Wienerdog teljes OS-jogosultságával. Ez történhet már a brain előtt a precommit `status` során, vagy commitkor. Az eredmény lehet arbitrary command execution vagy tartós dream-failure.

**Konkrét ajánlás**

A validator Git-műveleteit olyan code-owned konfigurációval kell futtatni, amelyet a vault `.git/config` nem befolyásolhat. Ha ez nem kerül ebbe a WP-be, a specifikációnak legalább:

1. ki kell mondania, hogy az M9-ből csak a hook surface záródik;
2. residualként fel kell vennie az összes executable Git-config surface-t, köztük a `core.fsmonitor` és signing programokat;
3. a successor detectort nem „hooks or filters", hanem executable repository Git configuration ellenőrzésére kell specifikálnia.

---

## 4. Table C egy korábban elfogadott layoutot figyelmeztetés nélkül másik könyvtárra állít át

- **Fájl:** `docs/specs/WP-dream-write-fence-control-files.md:207-217,344-350,399`
- **Érintett kód:** `src/core/layout.js:65-71,85-121`
- **Súlyosság:** Major
- **Bizalom:** 0.99

**Mi romolhat el?**

Egy meglévő user configja ma érvényesen tartalmazhatja például ezt:

```yaml
vault_layout:
  skills_dir: .skills
```

Upgrade után ugyanez a config csendben `05-Skills`-re esik vissza. A dream ettől kezdve új könyvtárba ír, a meglévő `.skills` tartalmat pedig Rule 1 tiltott pathnak tekinti.

A jelenlegi behavior közvetlen mérése:

```json
{"read":".skills","inferred":".skills"}
```

**Miért sérülékeny ez az útvonal?**

A változás egy korábban elfogadott konfigurációs értéket invaliddá tesz, miközben a fallback szándékosan néma marad. Nincs migration, warning, hard failure vagy diagnosztika. Az inference ma ugyanezt az értéket maga is elő tudja állítani, tehát ez nem csak kézzel fabrikált config lehet.

A releváns tesztekben nincs dot-prefixed layout fixture, ezért a jelenlegi suite zöld marad anélkül, hogy ezt a kompatibilitási regressziót észrevenné.

**Várható hatás**

A vault két párhuzamos struktúrára szakad. A user meglévő skilljei, daily note-jai vagy reportjai látszólag eltűnhetnek a Wienerdog számára, miközben új default könyvtárak jelennek meg. A csendes fallback miatt a hiba nehezen diagnosztizálható.

**Konkrét ajánlás**

A specifikáció írjon elő explicit upgrade-kezelést:

- vagy attended migrationt, amely a dot-prefixed layoutot csak user-confirmationnel módosítja;
- vagy fail-loud konfigurációs hibát, amely megnevezi az invalid kulcsot és az új korlátozást;
- vagy legalább tartós warningot, mielőtt a dream másik könyvtárba ír.

A silent fallback megőrzése ezen új inkompatibilitás mellett nem tekinthető változatlan contractnak.

---

## 5. Az idempotencia acceptance criterion ellentmond a validator kötelező report-append viselkedésének

- **Fájl:** `docs/specs/WP-dream-write-fence-control-files.md:351-355`
- **Érintett kód:** `src/core/dream/validate.js:1374-1391`
- **Súlyosság:** Spec-blocking
- **Bizalom:** 1.0

**Mi romolhat el?**

A criterion szerint a második dream run után a vault worktree byte-identical marad az első run utáni állapothoz képest. A validator azonban minden futásban új enforcement sectiont appendel a dream reporthoz, még akkor is, ha csak revert történt.

**Miért sérülékeny ez az útvonal?**

A criterion nem csak a denied pathok residue-ját hasonlítja össze, hanem a teljes vault worktree-t. A report módosítása miatt ez nem teljesíthető a jelenlegi contract mellett. A teljesítéshez az implementernek meg kellene változtatnia a report append-szemantikát, amit a specifikáció máshol változatlanként kezel.

**Várható hatás**

Az implementáció vagy jogosan elbukik egy lehetetlen acceptance criterionon, vagy scope-on kívül megváltoztatja a dream report történeti viselkedését. Egy „zöld" teszt csak a criterion leszűkítésével tudná elfedni az ellentmondást.

**Konkrét ajánlás**

A criteriont szűkíteni kell:

- a denied pathok post-validation filesystem állapota legyen byte-identical;
- az enforcement line legyen byte-identical;
- ne maradjon denied-file residue.

Ha a teljes vault byte-idempotenciája valóban követelmény, akkor a report de-duplication/replace behavior legyen külön, explicit contract és deliverable.

---

## Végrehajtott parancsok és eredmények

Minden parancs a `/Users/felho/dev/repos-to-learn-from/wienerdog` checkout ellen futott, kivéve a megjelölt ideiglenes reprodukciókat.

1. Kezdő `git status --porcelain`, `git branch --show-current`, `git rev-parse HEAD` — mind **exit 0**.
2. `wc -l` a teljes kötelező review set minden fájlján — minden hívás **exit 0**.
3. `nl -ba docs/specs/WP-dream-write-fence-control-files.md` — **exit 0**.
4. `sed -n '1,220p' ... | nl -ba` — **exit 0**.
5. `sed -n '221,440p' ... | nl -ba -v221` — **exit 0**.
6. `cat CLAUDE.md` — **exit 0**.
7. `nl -ba docs/specs/_TEMPLATE.md` — **exit 0**.
8. `nl -ba docs/runbooks/spec-authoring.md` — **exit 0**.
9. Célzott `nl | sed` olvasás a `src/core/dream/validate.js` fájlon — **exit 0**.
10. `nl -ba src/core/layout.js` — **exit 0**.
11. `nl -ba src/core/layout-infer.js` — **exit 0**.
12. Célzott `nl | sed` olvasás a `src/cli/dream.js` fájlon — **exit 0**.
13. `nl -ba src/core/dream/brain.js` — **exit 0**.
14. Második célzott `nl | sed` olvasás a validator security-relevant részein — **exit 0**.
15. `nl -ba src/core/runtime-profile.js` — **exit 0**.
16. `nl -ba src/core/adopt-git.js` — **exit 0**.
17. Célzott `nl | sed` olvasás az M7, M9, M10 és fourth addendum részeken — **exit 0**.
18. Célzott validator-olvasás a precommit, revert, status és commit útvonalakon — **exit 0**.
19. `grep -RInE "vault_layout:|skills_dir:|..." tests` — **exit 0**.
20. Dot-path keresés a három releváns unit testben — **exit 0**.
21. `grep -RInE "core\.fsmonitor|fsmonitor|core\.hooksPath|--no-verify|filter\." src tests` — **exit 1**, nincs találat.
22. `grep -RIn "validateAndCommit(" src tests` — **exit 0**.
23. `GIT_OPTIONAL_LOCKS=0 GIT_TRACE=1 git ... -c core.hooksPath=/dev/null -c core.fsmonitor=/usr/bin/false status` — Git **exit 0**; trace grep **exit 0**; cleanup **exit 0**.
24. `git grep -nE "git config|fsmonitor|gpgSign|gpg\.program|diff\.external|textconv" -- src tests` — keresés **exit 1**, nincs találat.
25. `cat package.json` — **exit 0**.
26. `npm test -- --test-name-pattern "dream|layout"` — **exit 0**; **322 pass, 0 fail**.
27. A focused test output `tail -n 40` olvasása — **exit 0**.
28. `npm test` — **exit 0**; **2037 test, 2028 pass, 9 skipped, 0 fail**.
29. `npm run lint` — **exit 0**; markdownlint és frontmatter check pass. A shellcheck és PSScriptAnalyzer nem futott, mert a binárisok nem voltak telepítve.
30. A teljes test output `tail -n 25` olvasása — **exit 0**.
31. Ideiglenes repositoryban `core.fsmonitor` reprodukció `core.hooksPath=/dev/null` mellett — wrapper **exit 0**, Git status **exit 0**, marker olvasás **exit 0**.
32. `nl | sed` a validator staged-diff és report műveletein — **exit 0**.
33. Node reprodukció a `.skills` layout read/infer behaviorhoz — **exit 0**.
34. Ideiglenes repositoryban same-run ignore bypass reprodukció a staging pontig — **exit 0**.
35. Ugyanez teljes commitig `core.hooksPath=/dev/null` és `--no-verify` mellett — wrapper **exit 0**, commit **exit 0**, `ls-tree` **exit 0**.
36. `grep -n "git(vaultDir" src/core/dream/validate.js` — **exit 0**.
37. `nl | sed -n '340,430p' src/cli/dream.js` — **exit 0**.
38. `nl | sed -n '300,345p' src/cli/dream.js` — **exit 0**.
39. Ideiglenes repositoryban konkurens user `CLAUDE.md` törlésének reprodukciója — **exit 0**.
40. Ideiglenes repositoryban korábban ignorált `.obsidian/workspace.json` törlésének reprodukciója — **exit 0**.
41. Ideiglenes repositoryban `commit.gpgSign`/`gpg.program` reprodukció — wrapper **exit 0**; a program elindult; a commit elvárt módon **exit 128**.
42. `nl | sed` a validator unit-test harness és report behavior részein — **exit 0**.
43. Záró `git status --porcelain` — **exit 0**.

## Read-only bizonyíték

Kezdő státusz: üres (0 bájt). Záró státusz: üres (0 bájt). Byte-identical; a
repositoryban nem keletkezett módosítás.
