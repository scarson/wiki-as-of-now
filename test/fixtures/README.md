# Detector fixtures — raw Wikipedia wikitext

These are **raw wikitext** captures (the `wtf_wikipedia` parser needs wikitext,
not rendered prose), fetched from the MediaWiki `action=raw` endpoint with a
descriptive User-Agent per the responsible-automated-access guardrail
(`docs/policy/wikipedia-genai-compliance.md`). Fetched 2026-06-04.

| File | Source article | Endpoint |
|------|----------------|----------|
| `sbx-1.wikitext` | [Sea-based X-band radar](https://en.wikipedia.org/wiki/Sea-based_X-band_radar) | `?action=raw` |
| `ground-based_midcourse_defense.wikitext` | [Ground-Based Midcourse Defense](https://en.wikipedia.org/wiki/Ground-Based_Midcourse_Defense) | `?action=raw` |
| `zumwalt-class_destroyer.wikitext` | [Zumwalt-class destroyer](https://en.wikipedia.org/wiki/Zumwalt-class_destroyer) | `?action=raw` |
| `littoral_combat_ship.wikitext` | [Littoral combat ship](https://en.wikipedia.org/wiki/Littoral_combat_ship) | `?action=raw` |

The detector tests pin `asOfYear = 2026`, so the fixtures' staleness labels stay
stable as the live articles evolve. Re-capturing a fixture means re-checking
`test/gold/gold-set.json` substrings against the new parse output.
