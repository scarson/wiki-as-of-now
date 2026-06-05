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

### Second wave — new domains / prose styles (100 fixtures total)

Added to stress the detector against prose that uses temporal claims differently
from US defence-equipment articles ("scheduled to open/launch in YYYY",
"expected to enter service", "due to be completed by") — and to exercise markers
the military set underused (`is scheduled to`, `to be completed by`, `is due to`):

- **Space / launch:** Artemis program, Europa Clipper, Mars Sample Return, Lunar Gateway, VIPER, Psyche, Dream Chaser, SpaceX Starship, New Glenn, Vulcan Centaur, Ariane 6, Space Launch System, Gaganyaan, Chandrayaan-3, Tiangong, Roman Space Telescope, Rosalind Franklin rover, Square Kilometre Array.
- **Rail & transit:** California High-Speed Rail, High Speed 2, Crossrail, Grand Paris Express, Brenner Base Tunnel, Honolulu Skyline, Second Avenue Subway, Brightline West, Stuttgart 21, Sydney Metro, Gateway Program, Suburban Rail Loop.
- **Infrastructure / dams / bridges:** Fehmarn Belt fixed link, Gordie Howe International Bridge, Grand Ethiopian Renaissance Dam.
- **Nuclear / energy:** Hinkley Point C, Vogtle, Flamanville, ITER, Olkiluoto, Sizewell C, NuScale.
- **Civil aviation:** Boeing 777X, Comac C919, Comac C929, Boeing NMA.
- **Naval:** Type 26 frigate, Type 31 frigate, Queen Elizabeth-class carrier, Columbia-class submarine, Constellation-class frigate, INS Vikrant.

### Third wave — saturation probe in distant registers (120 fixtures total)

A representative subset of two registers deliberately far from engineering prose,
to test whether the cataloged patterns hold or a new structural one appears
(see `docs/design/detector-precision-methodology.md` §5):

- **Clinical / biomedical (drug development):** Lecanemab, Donanemab, Aducanumab, exa-cel (Casgevy), Lenacapavir, Tirzepatide, HIV vaccine development, M72/AS01E (TB vaccine), Neuralink, RSV vaccine.
- **Legislation / policy:** EU AI Act, Digital Markets Act, Online Safety Act 2023, CHIPS and Science Act, European Chips Act, Windsor Framework, Euro 7, Kigali Amendment, Right to repair, Inflation Reduction Act.

(The giant articles in these waves — e.g. R21/Matrix-M, Sustainable Aviation Fuel,
Building Safety Act — were analysed but not committed, to keep the corpus bounded.)

Filenames are the lowercased article slug + `.wikitext`. A handful of requested
titles were redirects (resolved to the target shown) or did not exist and were
dropped.
