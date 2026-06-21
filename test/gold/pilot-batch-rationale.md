<!-- ABOUTME: Pilot-batch selection for the ground-truth corpus build (Task 3.1) — the chosen mixed ~8-10 stale claims + one-line rationale each. -->
<!-- ABOUTME: Selection only; the authored AnswerRecords live in answers.json and the escalation items in escalation-queue.md. -->

# Pilot batch — selection + rationale (Task 3.1)

Deliberately **mixed** batch of 9 `stale: true` claims drawn from the 32 in
[gold-set.json](gold-set.json), spanning likely-Tier-1 clean official sourcing
AND escalation-exercising cases (contested / slipped / plausibly unverifiable),
per design [§9](../../docs/design/2026-06-21-ground-truth-corpus-design.md). The
key is `(fixture, sentenceSubstring)`.

## Likely Tier-1 (clean official/primary sourcing — candidate `agent_auto`)

| # | fixture | sentenceSubstring | one-line rationale |
|---|---|---|---|
| 1 | `zumwalt-class_destroyer.wikitext` | `will be ready to test the CPS in 2025` | Navy hypersonic (Conventional Prompt Strike) milestone — `.mil`/USNI primary territory; the canonical clean exemplar named in the plan. |
| 2 | `littoral_combat_ship.wikitext` | `introduction is expected in 2017` | LCS unmanned surface sweep system (USSS) MCM increment — defense program with official/Navy reporting; 2017 long past, likely slipped or superseded. |
| 3 | `m109_howitzer.wikitext` | `plans to buy 133 vehicles` | Army M109A7 Paladin PIM procurement number/date — Army budget + defense trade press; checkable against the program of record. |
| 4 | `precision_strike_missile.wikitext` | `achieve initial operational capability in 2023` | Army PrSM IOC target — well-documented Army/Lockheed program (the fixture itself already shows a later FY28 IOC line, so disposition likely clean). |
| 5 | `gordie_howe_international_bridge.wikitext` | `to be completed by the end of 2024` | Binational bridge with an official authority (WDBA) + heavy mainstream coverage; completion/opening date is a hard, checkable public fact. |

## Escalation-exercising (contested / slipped / plausibly unverifiable — candidate `human_confirmed`)

| # | fixture | sentenceSubstring | one-line rationale |
|---|---|---|---|
| 6 | `honolulu_rail_transit.wikitext` | `is expected to be completed in August 2025` | Very granular sub-claim (utility relocations between two stations) on a project with a churning, contested schedule — support is likely diffuse/local-press; exercises escalation. |
| 7 | `gaganyaan.wikitext` | `scheduled to be launched no earlier than 2024` | ISRO crewed-spaceflight date that has repeatedly slipped; "no earlier than" + a passed date is hard to resolve positively → likely `slipped_still_pending` or `unverifiable`. |
| 8 | `hiv_vaccine_development.wikitext` | `phase one trial is expected to conclude July 2023` | Carries a `{{citation needed}}` in the fixture itself; trial-completion dates are often not announced cleanly → strong `unverifiable`/escalation candidate. |
| 9 | `rivian.wikitext` | `Construction is planned to begin in summer 2022` | Corporate construction timeline later paused (the fixture notes a 2024 pause); disposition is plausibly `superseded`/`event_cancelled` and may need judgment → escalation. |

**Selection scope note (verified):** all 9 are genuine world-fact claims (none are
detector-mechanics false-positive probes — those live in `det2-candidates.json` /
`det3-fp-set.json`, which `answers.json` does not key against), so design §9's
"skip pure detector-mechanics entries" clause excludes nothing here.
