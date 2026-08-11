# Codex adversarial review — round 8 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msokr1qi-3sbhl9
The test of whether round 7's two structural answers held.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Nem szállítható: az X1 család ismét megjelent, és a refusal döntés kizárólagos következményérve sem igaz minden mezőre.

Findings:
- [high] A persisted-surface kritérium ismét összemossa a két renderelési szakaszt (docs/specs/WP-neutralize-alert-callout-rendering.md:444-445)
  A „same properties” visszahivatkozás az előző kritériumok encoded-form és emitted-field állításait egyaránt rávetíti a managed blockra. Az over-budget encoded form azonban szándékosan nincs jelen ezen a felületen; ott csak a refusal mondat kerül kibocsátásra. Így egy helyes implementáció sem tudja szó szerint teljesíteni az encoded-form tulajdonságokat a persisted felületen, miközben az implementáló szabadon leszűkítheti a kritériumot az emitted formra. Ez az X1 szakasz-implicit család közvetlen visszatérése.
  Recommendation: Nevezze meg explicit módon, hogy ezen a felületen kizárólag az emitted-field tulajdonságokat kell ellenőrizni; mondja ki külön, hogy az encoded-form kritérium belső szakaszra vonatkozik, és nem persisted-surface állítás.
- [medium] A refusal döntés megmaradt következményérve hamis a job és log-hint mezőkre (docs/specs/WP-neutralize-alert-callout-rendering.md:238-240)
  A szerződés mind a négy mezőt ugyanazzal a per-field refusal szabállyal kezeli, mégis azt állítja, hogy refusal esetén a callout továbbra is megnevezi a jobot és a logot. Ha éppen a job encoded formja lépi túl a keretet, a jobnév helyére kerül a refusal mondat; ugyanez elveszíti a logmutatót egy túlméretes hint esetén. Két különálló, túlméretes jobnév ezért két sort ugyan létrehoz, de egyik hibás job sem azonosítható. A későbbi „No failing job can disappear” kritérium ezt nem fogja meg, mert kizárólag a sorok számát méri. A döntés deklarált, frekvenciától független indoklása tehát nem áll.
  Recommendation: Igazítsa a következményérvet a tényleges univerzális maradékhoz, vagy változtassa meg a szerződést úgy, hogy a job/log azonosíthatósága refusal mellett is megmaradjon. Az elfogadási kritérium ne nevezze ezt „no job can disappear” garanciának, ha csak a J sor meglétét biztosítja.

Next steps:
- Pontosítsák a persisted managed block kritériumát az emitted-field szakaszra.
- Javítsák a refusal döntés következményérvét és a job azonosíthatóságára vonatkozó elfogadási állítást.

Codex session ID: 019ff092-774a-7300-870c-4d306e39770e
Resume in Codex: codex resume 019ff092-774a-7300-870c-4d306e39770e
```
