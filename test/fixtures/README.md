# Detector fixtures — raw Wikipedia wikitext corpus

These are **raw wikitext** captures (the `wtf_wikipedia` parser needs wikitext,
not rendered prose), fetched from the MediaWiki `action=raw` endpoint with a
descriptive User-Agent per the responsible-automated-access guardrail
(`docs/policy/wikipedia-genai-compliance.md`). The detector tests pin
`asOfYear = 2026`, so staleness labels in `test/gold/gold-set.json` stay stable
as the live articles evolve. Re-capturing a fixture means re-checking the gold
substrings against the new parse output.

The corpus is intentionally broad — obscure defence equipment and procurement
programs, which are dense with temporal "is expected to / plans to / will … in
&lt;year&gt;" claims (both genuine stale forward claims and historical-narration
false positives). It exists so detector regressions surface against real prose,
not just hand-picked sentences.

## Corpus (fetched 2026-06; `?action=raw`)

- **Seed (initial Task 2.7):** sbx-1 (Sea-based X-band radar), ground-based midcourse defense, zumwalt-class destroyer, littoral combat ship.
- **Artillery & munitions:** m777 howitzer, m109 howitzer, 2S35 Koalitsiya-SV, Archer artillery system, Panzerhaubitze 2000, CAESAR, AS-90, K9 Thunder, M982 Excalibur, M1156 precision guidance kit, SMArt 155, M1299 howitzer (ERCA).
- **Sensors / radar:** AN/TPQ-53, AN/TPS-80 (G/ATOR), AN/SPY-6, AN/APG-81, Long Range Discrimination Radar, Space Fence.
- **Drones / UAS:** MQ-25 Stingray, RQ-21 Blackjack, MQ-20 Avenger, Northrop Grumman Tern, MQ-8 Fire Scout, AeroVironment Switchblade, Skyborg, MQ-1C Gray Eagle, XQ-58 Valkyrie, Anduril Altius (ALTIUS-600).
- **Ground vehicles:** M10 Booker, Armored Multi-Purpose Vehicle, Joint Light Tactical Vehicle, XM30 (Optionally Manned Fighting Vehicle), Next Generation Combat Vehicle (Robotic Combat Vehicle), Expeditionary Fighting Vehicle, Amphibious Combat Vehicle, Ground Combat Vehicle.
- **Experimental / programs:** Future Combat Systems, Future Vertical Lift, MV-75 (V-280 Valor), Future Attack Reconnaissance Aircraft, Next Generation Squad Weapon, Integrated Visual Augmentation System, AGM-183 ARRW, Precision Strike Missile, M7 rifle (XM7/NGSW), Long-Range Hypersonic Weapon (Dark Eagle).

Filenames are the lowercased article slug + `.wikitext`. A handful of requested
titles were redirects (resolved to the target shown above) or did not exist and
were dropped.
