# Codex adversarial review — round 6 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msok5ima-zlfklg
First attempt (review-msoiv072-lir5k1) HUNG — no log write for 32 minutes while the
broker still reported 'running/verifying' — and was cancelled. This is the re-run.
Run: codex-companion.mjs adversarial-review --background --base main.
Fresh round on the owner-ruled (c) contract: refusal instead of truncation.
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Nem szállítható még: a refusal biztonsági kimenete működőképes, de az új szerződés egyik elfogadási kritériuma továbbra is ághatárolás nélkül ellentmond a refusal ágnak, és két kapcsolódó állítás elavult vagy bizonyíthatóan túl széles.

Findings:
- [high] Az egzakt leképezési kritérium nincs a kódolási szakaszra korlátozva (docs/specs/WP-neutralize-alert-callout-rendering.md:384-400)
  Az AC szerint a mező minden pozícióján minden unsafe kódpont „always” tokenné válik, minden más változatlanul átmegy. A következő AC viszont az over-budget mező teljes tartalmát eldobatja. A második példában ezért a 400 LF egyszerre kellene 400 `<U+000A>` tokenné váljon és egyáltalán nem megjelennie. Ez csak egy ki nem mondott kétlépcsős értelmezéssel oldható fel: az egzakt leképezés a teljes köztes encoded form szerződése, míg a final renderer vagy ezt, vagy a refusal mondatot bocsátja ki. A „No scoping clause is needed” indoklás téves; a refusal megszünteti a részleges prefixet, de nem szünteti meg az ág szerinti határolás szükségességét.
  Recommendation: Nevezze meg külön a teljes kódolási eredmény és a végső emitted-field szerződését. Az exact/pass-through állításokat korlátozza a köztes encoded formra, az idempotenciát pedig egyértelműen a végső all-or-nothing transzformációra.
- [medium] A refusal normál működésbeli elérhetetlenségének indoklása hamis (docs/specs/WP-neutralize-alert-callout-rendering.md:237)
  A 353 karakteres mérés csak a `run-job.js` 839–850 közötti fix policy-warning sablonját méri. Ugyanez a specifikáció korábban rögzíti, hogy a valódi pre-routine ág a külső `claudeVersion` és a `probe.reason` értékét interpolálja, utóbbi pedig nyers `err.message` lehet. Ezek nincsenek 353 karakterre vagy biztonságos kódpontokra korlátozva, ezért egy valódi producerút complete encodingja átlépheti a 2000-es keretet. A „refusal never fires in normal operation” következtetés így nem támasztható alá a hivatkozott méréssel.
  Recommendation: Korlátozza a 353-as állítást a teljesen code-owned fix literálokra, és mondja ki, hogy az interpolált probe/version ág elérhetősége és mérete nincs itt korlátozva; törölje a normál működésre vonatkozó univerzális következtetést.
- [medium] A self-email következmény még mindig kizárólag escaped kimenetet állít (docs/specs/WP-neutralize-alert-callout-rendering.md:153-156)
  A bekezdés szerint bármely sortörést tartalmazó stored reason „one escaped line” formában jelenik meg a digestben. Az új refusal ág és a második worked example ezt cáfolja: kellően sok sortörés esetén egyetlen escape token sem kerül ki, csak a refusal mondat. Ez az old-rule maradvány két külön lehetséges elvárást hagy a digest/email összevetésében.
  Recommendation: Cserélje az állítást arra, hogy a reason egyetlen contained source line-ként jelenik meg: teljesen kódolva, ha belefér, különben a rögzített refusal mondattal.

Next steps:
- Pontosítsák a kétlépcsős encode-versus-emit szerződést és igazítsák hozzá az AC5-öt.
- Javítsák a túl széles normál-működési állítást és az elavult self-email tükrözést.
- A frissített specifikációt új adverszárius körben ellenőrizzék.

Codex session ID: 019ff083-2353-77a2-8aca-58b42620b642
Resume in Codex: codex resume 019ff083-2353-77a2-8aca-58b42620b642
```
