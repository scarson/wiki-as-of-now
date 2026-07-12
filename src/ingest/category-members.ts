// ABOUTME: Fetches mainspace article members of a Wikipedia category via the MediaWiki Action API.
// ABOUTME: Responsible access (descriptive UA, maxlag); response is untrusted data. Sequential by design (G14).
// v1 reads only the first page of up to 100 members per category (no cmcontinue pagination — a bounded-list
// decision; deeper pagination is a deferred enhancement, not a v1 requirement).
import { DEFAULT_USER_AGENT, WikimediaUnavailableError, WikimediaResponseError } from "./wikimedia";
import type { FetchLike } from "./wikimedia";

export interface CategoryMember {
  pageId: number;
  title: string;
}

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";

export async function fetchCategoryMembers(
  category: string,
  options: { fetchFn?: FetchLike; userAgent?: string } = {}
): Promise<CategoryMember[]> {
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const params = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: category,
    cmtype: "page",
    cmlimit: "100",
    format: "json",
    formatversion: "2",
    maxlag: "5",
  });
  const res = await fetchFn(`${API_ENDPOINT}?${params.toString()}`, {
    headers: { "User-Agent": userAgent },
  });

  let body: {
    error?: { code?: string; info?: string };
    query?: { categorymembers?: { pageid?: number; ns?: number; title?: string }[] };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    throw new WikimediaResponseError(`categorymembers non-JSON body (HTTP ${res.status})`);
  }
  if (body.error?.code === "maxlag") {
    throw new WikimediaUnavailableError(`maxlag: ${body.error.info ?? ""}`.trim());
  }
  if (body.error) {
    throw new WikimediaResponseError(`categorymembers API error: ${body.error.code ?? "unknown"}`);
  }
  const members = body.query?.categorymembers ?? [];
  return members
    .filter((m) => m.ns === 0 && typeof m.pageid === "number" && typeof m.title === "string")
    .map((m) => ({ pageId: m.pageid as number, title: m.title as string }));
}
