---
title: Round 1 raw — quarantine surface split (external adversarial review, verbatim)
date: 2026-08-29
related_wps: [WP-quarantine-warnings-file, WP-doctor-quarantine-counts, WP-quarantine-banner-decay, WP-dream-report-run-skips]
---

# Round 1 raw — external adversarial review, relayed verbatim

Backend: gptsol agent (codex/gpt-5.6-sol), vendored prompt
`docs/runbooks/review-prompts/adversarial.md`, focus text per the round record.
Reviewed tip: `8c09a5e`. Committed before adjudication per
`docs/runbooks/codex-review.md`. Read-only verified (`git status --porcelain`
byte-identical before/after, both empty; asserted inside the payload).

Relay note: the reviewer emitted its `summary` and finding `body` fields in
Hungarian (language leaked from the orchestrating session's locale, not from
the vendored prompt, which is English). Relayed verbatim anyway (transport
HTML entities de-escaped, nothing else touched) — the verbatim rule protects
adjudication integrity and outranks the English-content rule for frozen round
evidence. The round record carries English summaries.

---

```json
{
  "verdict": "needs-attention",
  "summary": "Nem szállítható még: a specifikációk két valós állapotátmenetet hibásan számolnak, a warnings fájl tartalma tartósan eltérhet a ledgertől, és két csomaghatár nincs összehangolva a promotion átírásával.",
  "findings": [
    {
      "file": "docs/specs/WP-quarantine-warnings-file.md",
      "line_start": 320,
      "line_end": 340,
      "confidence": 0.99,
      "body": "A frissítési döntés kizárólag a quarantined ledger-kulcsok halmazát hasonlítja össze. Egy korábban karanténba tett fájl megváltozott fingerprinttel újra kiválasztható, majd ugyanazon kulcson újra karanténba kerülhet más reasonnel vagy mérettel. Ilyenkor az entered és left halmaz is üres, ezért egy létező reports/warnings.md nem íródik újra, noha a renderelt Current conditions tartalmának változnia kellene. A futtatott probe ezt a konkrét átmenetet igazolta: a megváltozott fájl select állapotba került, a kulcshalmaz változatlan maradt, miközben a reason over-ceiling értékről read-error értékre változott. Ennek hatására doctor az új ledgerből számolhat, miközben a fájl korlátlan ideig a régi okot és méretet mutatja; ez meghaladja a specifikáció által elfogadott egy-run lagot, és a pointer hamis választ adhat arra, hogy miért marad ki egy session.",
      "recommendation": "A write döntést ne csak a kulcshalmazra alapozza. Készítsen determinisztikus snapshotot a Current conditions összes renderelt adatáról, legalább a kulcsból, reasonből, displayName-ből és megjelenített méretből. Ha ez változik, írja újra a fájlt; a Run log továbbra is csak valódi membership-delta esetén kapjon új sort. Legyen külön teszt ugyanazon kulcs reason-, fingerprint- és méretváltozására."
    },
    {
      "file": "docs/specs/WP-dream-report-run-skips.md",
      "line_start": 167,
      "line_end": 179,
      "confidence": 0.99,
      "body": "A stillQuarantined definíciója a run-start ledger teljes aktív quarantine-halmazát használja, de ez nem azonos azokkal a fájlokkal, amelyeket a futás ténylegesen újra kihagyott. Egy megváltozott fingerprintű korábbi quarantine select állapotba kerül: feldolgozható, capacity-deferred lehet, vagy ismét bekerülhet sel.newlyQuarantined alá. Az utóbbi esetben ugyanaz a fájl egyszerre szerepel a newlyQuarantined és stillQuarantined számokban, közvetlenül cáfolva az overlap-is-impossible állítást; sikeres feldolgozás esetén pedig a riport azt mondja, hogy a fájlt újra kihagyták, miközben konszolidálták. Egy eltűnt, már nem discoverolt fájlt szintén stillQuarantinedként számolna. A tartós dream report így hamis coverage-történetet őrizne meg, miközben a csomag exact-count szerződést ígér.",
      "recommendation": "A collectExtracts adjon vissza külön skippedQuarantined halmazt vagy számot, amelyet közvetlenül azokból a discoverolt fájlokból képez, amelyekre selectState ténylegesen skip-quarantined eredményt adott. A stillQuarantined ebből származzon, ne a run-start ledger méretéből. Emiatt a src/core/dream/scratch.js és a hozzá tartozó tesztek kerüljenek be a Deliverables táblába; a diszjunkt halmazokra legyen teszt változatlan, megváltozott, újra-karanténba tett, sikeresen újrafeldolgozott és eltűnt fájllal."
    },
    {
      "file": "docs/specs/WP-quarantine-warnings-file.md",
      "line_start": 394,
      "line_end": 400,
      "confidence": 0.97,
      "body": "A csomag kifejezetten arra támaszkodik, hogy a commit után vagy idle run során írt warnings fájlt a következő futás precommitSessionEdits hívása commitolja. A már Ready WP-dream-promote-in-workspace azonban eltávolítja ezt a hívást, és a G8 szerződése szerint a dream commit csak promoted pathokat és a reportot tartalmazza. A warnings fájl egyik kategóriába sem tartozik. Ha a warnings csomag rootként előbb landol, majd a promotion átírás követi, a post-commit és idle reconciliation írások tartósan uncommitted állapotban maradhatnak, a point-1 írás pedig kimaradhat a szelektív commitból. Ez elveszíti a specifikáció által ígért git-backed, történetileg diffelhető durable recordot. A jelenlegi depends_on üres, és egyik csomag szerződése sem örökíti tovább ezt a commit-kötelezettséget.",
      "recommendation": "Rögzítse a csomagok közötti handoffot a specifikációkban. A root sorrend megtartásához a WP-dream-promote-in-workspace függjön a WP-quarantine-warnings-file csomagtól, és G8/Table V kifejezetten örökítse a code-owned warnings fájl commitolását, annak eldöntött byte-jaival együtt. Alternatívaként a warnings csomag függjön a promotion csomagtól, és az új pipeline ellen legyen újratervezve. A jelenlegi két szerződés együtt nem teljesíthető."
    },
    {
      "file": "docs/specs/WP-dream-report-run-skips.md",
      "line_start": 101,
      "line_end": 118,
      "confidence": 0.96,
      "body": "A Deliverables permission boundary olyan fájlokat sorol fel, amelyekről maga a specifikáció mondja, hogy a promotion átírás után más fájlokra cserélődnek. A szöveg szerint ezt a dispatch message helyettesíti, nem maga a specifikáció. Ez nem módosítja a repository által érvényesített határt: a projekt szabálya szerint csak a spec Deliverables táblájában szereplő fájlok érinthetők, és az azon kívüli módosításokat CI elutasítja. A várt post-promotion implementáció ezért vagy a régi validate fájlokat módosítja hibásan, vagy a tényleges promote fájlokat érinti a deklarált határon kívül. A Definition of done későbbi szövege sem oldja fel ezt, mert szintén csak a dispatch message-ben rögzített substitutions elemeket követeli meg.",
      "recommendation": "Dispatch előtt magát a spec fájlt módosítsa: vezesse át a végleges Deliverables sorokat, Current-state citationöket, Table B source mezőket és verification commandokat az aktuális fástruktúrára, majd távolítson el minden PROVISIONAL markert. A dispatch message csak a re-derivation SHA-ját és összefoglalóját rögzítse; ne próbálja helyettesíteni a permission boundaryt."
    }
  ],
  "Scope objections (routed to the owner, not counted)": "none",
  "executed_vs_read": {
    "executed": [
      {
        "command": "git -C /Users/felho/dev/repos-to-learn-from/wienerdog-165 status --porcelain",
        "purpose": "Kezdeti working-tree állapot rögzítése.",
        "output": ""
      },
      {
        "command": "git -C /Users/felho/dev/repos-to-learn-from/wienerdog-165 rev-parse HEAD",
        "purpose": "A reviewolt tip ellenőrzése.",
        "output": "8c09a5e11c27316dc51325fcb7da3784669ee7bd"
      },
      {
        "command": "node -e \"const l=require('/Users/felho/dev/repos-to-learn-from/wienerdog-165/src/core/dream/ledger.js');const d={harness:'codex',path:'/tmp/session.jsonl',mtimeMs:1,size:60_000_000,dev:1,ino:1};const old=l.recordQuarantined({version:1,baseline_mtime:{claude:null,codex:null},files:{}},d,'over-ceiling');const changed={...d,mtimeMs:2,size:64};const next=l.recordQuarantined(old,changed,'read-error');console.log(JSON.stringify({runStartActive:l.activeQuarantines(old),changedSelection:l.selectState(old,changed),sameKeySet:Object.keys(old.files).join()===Object.keys(next.files).join(),oldReason:l.activeQuarantines(old)[0].reason,newReason:l.activeQuarantines(next)[0].reason}));\"",
        "purpose": "A megváltozott fingerprintű, azonos kulcsú re-quarantine átmenet ellenőrzése.",
        "output": "{\"runStartActive\":[{\"file\":\"session.jsonl\",\"reason\":\"over-ceiling\",\"harness\":\"codex\"}],\"changedSelection\":\"select\",\"sameKeySet\":true,\"oldReason\":\"over-ceiling\",\"newReason\":\"read-error\"}"
      },
      {
        "command": "node -e \"const f=n=>`> [!warning] Wienerdog: ${n} session transcript(s) are being skipped and will not be dreamed over. Which ones, and why: reports/warnings.md in your vault. Dreaming continues over your other sessions; a skipped file is retried automatically if it changes.`;console.log(JSON.stringify({n1:Buffer.byteLength(f(1)),n191:Buffer.byteLength(f(191)),delta:Buffer.byteLength(f(191))-Buffer.byteLength(f(1))}));\"",
        "purpose": "Az N=1 és N=191 informational banner byte-méretének ellenőrzése.",
        "output": "{\"n1\":251,\"n191\":253,\"delta\":2}"
      },
      {
        "command": "git -C /Users/felho/dev/repos-to-learn-from/wienerdog-165 status --porcelain",
        "purpose": "Végső working-tree állapot rögzítése.",
        "output": ""
      }
    ],
    "read": [
      "docs/adr/0023-bounded-transcript-intake-and-quarantine-ledger.md — full file; only Amendment 2 assessed.",
      "docs/specs/WP-quarantine-warnings-file.md — full.",
      "docs/specs/WP-doctor-quarantine-counts.md — full.",
      "docs/specs/WP-quarantine-banner-decay.md — full.",
      "docs/specs/WP-dream-report-run-skips.md — full.",
      "src/core/dream/ledger.js — full. src/cli/dream.js — full. src/core/dream/validate.js — 1050-1469. src/cli/doctor.js — full. src/core/digest.js — 600-880. src/core/dream/vault-write.js — full. src/core/dream/scratch.js — full. src/core/vault-snapshot.js — full.",
      "docs/GLOSSARY.md, docs/specs/_TEMPLATE.md — full.",
      "docs/specs/WP-dream-promote-module.md, WP-dream-promote-report.md, WP-dream-promote-in-workspace.md — full.",
      "tests/unit/ledger.test.js 160-476, doctor.test.js 1-180, digest.test.js 150-219, sync-digest-quarantine.test.js full, dream-validate.test.js 240-339."
    ]
  },
  "git_status_before": "",
  "git_status_after": "",
  "git_status_byte_identical": true
}
```
