// ABOUTME: The two v1 launch topics (category seed sets) + buildSeedList: members→counts→rank→persist.
// ABOUTME: Sequential pageview fetch (G14); deps injected so tests use fixtures, prod wires live clients.
import type { SqlExecutor } from "../db/client";
import { upsertSeedList, replaceSeedListEntries } from "../db/seed-lists";
import { pageviewWindow, rankByPageviews } from "./pageviews";
import type { CategoryMember } from "./category-members";

export interface SeedTopic {
  slug: string;
  title: string;
  categories: string[];
}

// Seed categories chosen for populated mainspace membership (container categories like
// "Category:Military procurement" / "Category:Defense procurement" hold only subcategories,
// not articles, so they would yield empty lists). See phase-4 build report deviation D-1.
export const SEED_TOPICS: Record<string, SeedTopic> = {
  "military-procurement": {
    slug: "military-procurement",
    title: "Military procurement",
    categories: ["Category:Military acquisition", "Category:Arms industry"],
  },
  "infrastructure-megaprojects": {
    slug: "infrastructure-megaprojects",
    title: "Infrastructure megaprojects",
    categories: ["Category:Megaprojects", "Category:Proposed infrastructure"],
  },
};

export interface BuildSeedListDeps {
  now: Date;
  fetchCategoryMembers: (category: string) => Promise<CategoryMember[]>;
  fetchPageviewCount: (title: string, window: { start: string; end: string }) => Promise<number>;
}

export async function buildSeedList(
  db: SqlExecutor,
  topicSlug: string,
  deps: BuildSeedListDeps
): Promise<{ entryCount: number }> {
  const topic = SEED_TOPICS[topicSlug];
  if (!topic) throw new Error(`unknown seed topic: ${topicSlug}`);
  const window = pageviewWindow(deps.now);

  // Gather unique members across the topic's categories (sequential — G14).
  const byPageId = new Map<number, CategoryMember>();
  for (const cat of topic.categories) {
    const members = await deps.fetchCategoryMembers(cat);
    for (const m of members) if (!byPageId.has(m.pageId)) byPageId.set(m.pageId, m);
  }

  // Sequential pageview fetch (G14 — never Promise.all over the live endpoint).
  const rankable = [];
  for (const m of byPageId.values()) {
    const count = await deps.fetchPageviewCount(m.title, window);
    rankable.push({ pageId: m.pageId, title: m.title, pageviewCount: count });
  }

  const ranked = rankByPageviews(rankable);
  await upsertSeedList(db, {
    topic: topic.slug,
    title: topic.title,
    refreshedAt: deps.now.toISOString(),
    windowStart: window.start,
    windowEnd: window.end,
    entryCount: ranked.length,
  });
  await replaceSeedListEntries(
    db,
    topic.slug,
    ranked.map((r) => ({
      topic: topic.slug,
      rank: r.rank,
      pageId: r.pageId,
      articleTitle: r.title,
      pageviewCount: r.pageviewCount,
    }))
  );
  return { entryCount: ranked.length };
}
