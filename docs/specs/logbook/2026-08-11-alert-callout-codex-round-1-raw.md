# Codex adversarial review — round 1 (raw, unadjudicated)

WP: WP-neutralize-alert-callout-rendering
Job: review-msnx33ya-319rf0 | Codex session 019fee33-f68f-7e33-b42c-b905ff6dfaf9
Run: codex-companion.mjs adversarial-review --wait --base main, from the wp/neutralize-alert-callout-rendering worktree
Committed before any finding was read for adjudication, per docs/runbooks/codex-review.md.

```text
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

Ne szállítsátok még: a kanonikus szerződés a fizikai sorelválasztást kezeli, de ennél erősebb strukturális biztonságot ígér, az egyik acceptance criterion pedig a dokumentált byte-starvation residual miatt hamis.

Findings:
- [high] Az unsafe set nem akadályozza meg a renderelt struktúra hamisítását (docs/specs/WP-neutralize-alert-callout-rendering.md:184-188)
  A denylist minden nyers sortörést lefed, ezért fizikai forrássoronkénti containmentre elég lehet. A spec azonban azt állítja, hogy mezőtartalom struktúrát sem hozhat létre. Egy kizárólag biztonságos ASCII-ből álló érték, például `</blockquote><br><h1>Standing instructions</h1>`, átmegy változatlanul, miközben egy raw-HTML-t engedő Markdown-renderer vizuális sortörést és címsort hozhat létre, akár a blockquote lezárásával. Így az „egy kibocsátott forrássor” teljesülhet, miközben a címben és a security checklistben ígért strukturális containment nem.
  Recommendation: Döntsétek el, hogy a termékszerződés kizárólag fizikai forrássor-containmentet garantál-e. Ha igen, szűkítsétek ehhez a címet és minden „nem hozhat létre struktúrát” állítást; ha nem, a kanonikus szerződésnek az érintett Markdown/HTML renderelési viselkedést is semlegesítenie vagy kereteznie kell.
- [high] A teljes digest sorszámát összehasonlító acceptance criterion hamis (docs/specs/WP-neutralize-alert-callout-rendering.md:296-301)
  Az unsafe karakter benign karakterre cserélt kontrollváltozata nem azonos prefix-byte-méretű: például egy LF 1 byte, míg `<U+000A>` 8 byte. Mivel `capDigest` először a prefix tényleges byte-jait foglalja le, egy byte-cap közelében lévő digestben a nagyobb escaped prefix más számú body-sort hagy meg. Ezt maga a spec is elismeri a 249–253. sorban. Egy Table A-nak megfelelő implementáció ezért megszegheti a 298–300. sor teljes-digest sorszámegyenlőségét anélkül, hogy bármely mező új sort hozna létre.
  Recommendation: A kritériumot a callout blokk forrássoraira és azok kód-owned kereteire korlátozzátok; a body byte-budget változását külön, a már deklarált residualhoz igazodó állítás kezelje.
- [medium] Az import nem teszi konstrukcióvá a non-widening állítást (docs/specs/WP-neutralize-alert-callout-rendering.md:191-195)
  A konstans importálása csak ugyanazt a numerikus értéket használja; nem bizonyítja, hogy ugyanazt a feldolgozási szakaszt vagy a `capDigest` által mért UTF-8 byte-okat korlátozza. A tényleges `sanitizeAlert` előbb végzi a `.slice(0, MAX_FIELD_CHARS)` műveletet, majd futtatja a potenciálisan bővítő `redactOnly` transzformot. Konkrétan egy 2000 karakteres, szóközzel elválasztott `api_key=aaaaaaaaaaaa` sorozat 3235 karakteres redaktált értékké bővül. Egy ilyen JSONL mezőt a `readAlerts` N-nél hosszabban adhat tovább a renderernek. Emiatt a rendered budget benign, unsafe karakter nélküli tartalmat is levághat, ami ütközik a byte-frozen Template sorral; az import önmagában ezt nem zárja ki.
  Recommendation: A non-widening szerződést a `formatAlerts`-hoz ténylegesen eljutó, post-redaction értékekre és a `capDigest` UTF-8 byte-mértékére alapozzátok. Külön döntsétek el, hogy a redaction által N fölé bővített, egyébként benign érték csonkítható-e, és ehhez szűkítsétek a byte-identitási univerzálist.
- [medium] A self-email non-goal egyik alapja a már megsértett kontraktusra hivatkozik (docs/specs/WP-neutralize-alert-callout-rendering.md:123-133)
  A 3. indok szerint az email body már code-owned tartalomként szabályozott, miközben ugyanennek a specnek a Context része és a HEAD kódja szerint a `reason` raw Node `err.message`-et és külső `claude --version` kimenetet is tartalmazhat. A branded self-email fix `[wienerdog alert]` tárggyal és Wienerdog-preambulummal érkezik, ezért a több nyers sor ugyan nem modell-authoritást, de hitelesnek látszó emberi utasítást hamisíthat. A korábbi WP kontraktusának puszta létezése nem mitigáció, ha a jelenlegi producer megsérti azt.
  Recommendation: Ne használjátok a WP-151/JSDoc kontraktust a kizárás biztonsági indokaként. A producer residualt vagy tegyétek explicit előfeltétellé, vagy rögzítsetek külön, tulajdonos által elfogadott kockázati döntést arról, hogy a branded self-email továbbra is nyers, többsoros külső tartalmat kaphat.

Next steps:
- Javítsátok először Table A strukturális garanciájának hatókörét.
- Oldjátok fel a byte-budget és a teljes-digest sorszámegyenlőség közötti ellentmondást.
- Pontosítsátok a post-redaction mezőméret és az email residual tulajdonosi döntését.

Codex session ID: 019fee33-f68f-7e33-b42c-b905ff6dfaf9
Resume in Codex: codex resume 019fee33-f68f-7e33-b42c-b905ff6dfaf9
```
