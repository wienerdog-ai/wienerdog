# Codex adversarial review — round 4 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msnyh7ss-jbqcuo
Run: codex-companion.mjs adversarial-review --background --base main, from the wp/neutralize-alert-callout-rendering worktree.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Nem szállítható még: T1 és T3 érdemben javult, T2 feltételei már együtt teljesíthetők, de a lazítás most szükségtelen adatvesztést engedő implementációt is átenged.

Findings:
- [high] A csonkolási szerződés tetszőlegesen rövid megtartott prefixet is elfogad (docs/specs/WP-neutralize-alert-callout-rendering.md:371-395)
  Az egzakt leképezés csak az implementáció által megtartott prefixre vonatkozik, miközben sem Table A, sem az elfogadási kritériumok nem követelik meg a költségvetésbe férő leghosszabb teljes prefix megtartását. Egy hibás implementáció ezért egy túlcsorduló, escape-tokeneket tartalmazó mezőből akár semmit vagy egyetlen kódpontot tarthat meg, majd hozzáadhatja az „…” jelet. Ez továbbra is teljesíti a megtartott prefixre vonatkozó leképezést, a tokenhatárt, a kimeneti korlátot, az idempotenciát és a byte-starvation feltételt. A 2000 karakteres példa csak a biztonságos szöveg esetét rögzíti, így az unsafe-heavy mezők indokolatlan elvesztését nem zárja ki. Ennek hatására fontos hibaok vagy log_hint elveszhet, miközben minden elfogadási kapu zöld marad.
  Recommendation: A csonkolási szerződés követelje meg a mező azon leghosszabb forrásprefixének megtartását, amelynek teljes, tokenhatáron végződő kódolása belefér a mező költségvetésébe; az overflow jel csak az ezt követő eldobott suffixet jelezhesse.

Next steps:
- Pontosítsák Table A truncation-boundary sorát és az elfogadási feltételt maximális, teljes-tokenes prefixre.
- A módosítás után ellenőrizzék újra az exact-mapping, budget és idempotence állítások közös teljesíthetőségét.

Codex session ID: 019fee57-a17d-72f0-a4f3-218490f62880
Resume in Codex: codex resume 019fee57-a17d-72f0-a4f3-218490f62880
```
