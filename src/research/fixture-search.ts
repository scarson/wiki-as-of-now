// ABOUTME: Fixture-backed SearchProvider — returns RECORDED real URLs for test claims so the full fetch+verify+triage
// ABOUTME: path runs with no Brave key (build design §3.6). The URLs are real public pages; nothing is fabricated.
import { readFileSync } from "node:fs";
import type { SearchProvider, SearchHit } from "./search-provider";
import { manualUrlsAsHits } from "./search-provider";

type FixtureMap = Record<string, string[]>;
const DEFAULT_FIXTURE_PATH = "test/research/fixtures/search-fixtures.json";

export class FixtureSearchProvider implements SearchProvider {
  private readonly map: FixtureMap;
  constructor(map?: FixtureMap) {
    this.map = map ?? (JSON.parse(readFileSync(DEFAULT_FIXTURE_PATH, "utf8")) as FixtureMap);
  }
  queries(): FixtureMap { return this.map; }
  async search(query: string): Promise<SearchHit[]> {
    return manualUrlsAsHits(this.map[query] ?? []);
  }
}
