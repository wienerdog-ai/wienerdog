# Codex adversarial round 4 — WP-daily-summary-per-line-framing

Raw runtime output, byte-unchanged inside the fence, committed before it was read.

```text
[codex] Starting Codex task thread.
[codex] Thread ready (019fe882-f903-7e20-a070-3c16cde7a2b8).
[codex] Turn started (019fe882-f9d3-7cf3-aa16-2f349a7c1223).
[codex] Assistant message captured: {"verdict":"approve","summary":"A célzott diffet és a két engedélyezett dokumentumot vizsgálo...
[codex] Running command: /bin/zsh -lc 'git diff --unified=80 main...HEAD -- docs/specs/WP-daily-summary-per-line-frami...
[codex] Command completed: /bin/zsh -lc 'git diff --unified=80 main...HEAD -- docs/specs/WP-daily-summary-per-line-frami... (exit 0)
[codex] Running command: /bin/zsh -lc "sed -n '1,180p' docs/specs/WP-daily-summary-per-line-framing.md | nl -ba && git...
[codex] Command completed: /bin/zsh -lc "sed -n '1,180p' docs/specs/WP-daily-summary-per-line-framing.md | nl -ba && git... (exit 0)
[codex] Running command: /bin/zsh -lc "grep -c 'DAILY_FENCE_DOES_NOT_EXIST' docs/specs/WP-daily-summary-per-line-frami...
[codex] Command completed: /bin/zsh -lc "grep -c 'DAILY_FENCE_DOES_NOT_EXIST' docs/specs/WP-daily-summary-per-line-frami... (exit 0)
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"JOB A — FIXED. A WP Table A a `Cc ∪ Cf ∪ Cs ∪ Default...
[codex] Turn completed.
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

JOB A — FIXED. A WP Table A a `Cc ∪ Cf ∪ Cs ∪ Default_Ignorable_Code_Point` halmazt írja elő, a TAB és a töréskészlet kivételével, és külön nevesíti az U+FE0F, U+E0100, U+115F és U+034F eseteket (docs/specs/WP-daily-summary-per-line-framing.md:143-145). Az ADR ugyanezt az uniót, kivételeket és kódolást rögzíti (docs/adr/0032-daily-summary-untrusted-fence.md:136-146). JOB B — PRODUCT: nincs megállapítás; a terméktervezési review loop lezárható. MACHINERY: egy blokkoló ellenőrzési hiba maradt.

Findings:
- [medium] MACHINERY — Az állítólagos verification gate-ek nem végrehajtható állítások (docs/specs/WP-daily-summary-per-line-framing.md:253-264)
  A byte-exact ADR-ellenőrzés csak a sor `decision 1`-ig tartó prefixét keresi, ezért a sor hátralévő részének átírása továbbra is 1 találatot ad. A `git diff --numstat` csak kiírja a törlésszámot, de törlés esetén is sikeres státusszal tér vissza. A helyes állapotban nulla régi konstansra számító `grep -c` pedig 0-t ír ki, de 1-es hibakóddal tér vissza. Ez ellentmond a „real green / real red” követelménynek, és automatizált vagy `set -e` futtatásban vagy a jó állapotot buktatja, vagy a hibás állapotot nem buktatja.
  Recommendation: Alakítsák a három parancsot valódi shell-assertionné: ellenőrizzék explicit módon, hogy a numstat második mezője 0; használjanak `grep -Fxc`-t a teljes byte-exact amender sorra és hasonlítsák 1-hez; a konstans hiányát pedig `! grep -q 'DAILY_FENCE' src/core/digest.js` formában ellenőrizzék. Ezután ismételjék meg a dokumentált zöld és szándékosan törött piros futásokat.

Next steps:
- Javítsák a verification parancsokat; termék-contract módosítás nem szükséges.
```
