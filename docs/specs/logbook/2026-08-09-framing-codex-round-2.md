# Codex adversarial round 2 — WP-daily-summary-per-line-framing

Raw runtime output, byte-unchanged inside the fence, committed before it was read.

```text
[codex] Starting Codex task thread.
[codex] Thread ready (019fe84c-ea21-7ed2-a050-8b3068c36c1f).
[codex] Turn started (019fe84c-eb0e-7571-8d0c-63099eb552a6).
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"A két kijelölt dokumentum diffjét és a pontos sorszám...
[codex] Running command: /bin/zsh -lc 'git diff --unified=80 main -- docs/specs/WP-daily-summary-per-line-framing.md d...
[codex] Command completed: /bin/zsh -lc 'git diff --unified=80 main -- docs/specs/WP-daily-summary-per-line-framing.md d... (exit 0)
[codex] Running command: /bin/zsh -lc "nl -ba docs/specs/WP-daily-summary-per-line-framing.md | sed -n '1,277p'"
[codex] Command completed: /bin/zsh -lc "nl -ba docs/specs/WP-daily-summary-per-line-framing.md | sed -n '1,277p'" (exit 0)
[codex] Assistant message captured: {"verdict":"needs-attention","summary":"NO-SHIP. Az öt Round-1 tételből négy ténylegesen javí...
[codex] Turn completed.
# Codex Adversarial Review

Target: branch diff against main
Verdict: needs-attention

NO-SHIP. Az öt Round-1 tételből négy ténylegesen javított, de ADR-0032 továbbra is két egymásnak ellentmondó normatív állapotot tartalmaz. Az új kontrollkarakter-kódolási szerződés sincs elég pontosan meghatározva a biztonságos, reprodukálható implementációhoz.

Findings:
- [high] Round-1 #5 NOT FIXED: a PROPOSED módosítás nem írja felül az elfogadott blokkkerítést (docs/adr/0032-daily-summary-untrusted-fence.md:108-110)
  Round-1 ellenőrzés: (1) FIXED — docs/specs/WP-daily-summary-per-line-framing.md:143-144 teljes sortöréskészletet és C0/C1-kódolást ír elő; (2) FIXED — ugyanott:147,178-179 a normalizált, még jelöletlen szöveget vizsgálja; (3) FIXED — ugyanott:141 előírja a blokkot lezáró üres sort; (4) FIXED — ugyanott:146-147 külön fázisokra választja a hűséget, titokkaput és capDigest-et; (5) NOT FIXED — az elfogadott Decision 1 továbbra is a blokkkerítést írja elő az ADR:41-46 sorain, miközben az ezt visszavonó módosítás státusza csak PROPOSED az ADR:108-110 sorain. Az implementáló így két ellentétes utasítást kap egy Accepted ADR-ben; aláírás előtt nincs meghatározva, melyiket kell követnie.
  Recommendation: A megvalósítás vagy szállítás előtt az owner fogadja el a módosítást, és az ADR egyértelműen jelezze, hogy Decision 1-et az elfogadott amendment felülírja. Addig a WP maradjon blokkolt.
- [medium] Az új „látható kódolás” nem byte-egzakt és nem kezeli a veszélyes Unicode formázó karaktereket (docs/specs/WP-daily-summary-per-line-framing.md:143-146)
  A szerződés csak azt mondja, hogy a C0/C1 karakterek „code-owned, visible encoding” alakban jelenjenek meg, de nem határozza meg a kódolás literálját, az escape-introducer escapingjét vagy a visszafejtést. Egy implementáció például `⟨U+001B⟩`-t írhat, amit az eredeti tartalom szó szerint is előállíthat; így a kódolt és az eredeti szöveg összemosódik, a 146. sor szerinti fidelity nem ellenőrizhető egyértelműen, és eltérő implementációk eltérő outputot adhatnak. A szabály emellett csak C0/C1-re terjed ki, ezért bidi override/isolates (például U+202E), default-ignorable és zero-width karakterek nyersen maradhatnak, miközben a security checklist a 196. sorban általánosan azt állítja, hogy semmilyen kontrollkarakter nem zavarhatja meg a renderelt markert. Lone surrogate és hibás Unicode-kezelés sincs definiálva.
  Recommendation: Adjon meg byte-egzakt, ütközésmentes és visszafejthető escape-formátumot, beleértve az escape-introducer kezelését; definiálja a lone surrogate/hibás Unicode viselkedést; továbbá kódolja vagy utasítsa el legalább a bidi vezérlőket és a marker vizuális integritását veszélyeztető default-ignorable karaktereket. Ezekhez legyenek literál outputot ellenőrző tesztvektorok.
```
