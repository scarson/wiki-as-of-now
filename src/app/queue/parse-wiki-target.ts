// ABOUTME: Normalizes a pasted Wikipedia article URL OR a bare title into a clean article title.
// ABOUTME: Pure + shared by the capture form (client pre-validation) and capture route (server authority).
export type ParseResult = { ok: true; title: string } | { ok: false; reason: string };

export function parseWikiTarget(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "empty" };
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
    if (!/(^|\.)wikipedia\.org$/i.test(url.hostname)) return { ok: false, reason: "not_wikipedia" };
    const m = url.pathname.match(/^\/wiki\/(.+)$/);
    if (!m) return { ok: false, reason: "not_an_article_url" };
    let decoded: string;
    try {
      decoded = decodeURIComponent(m[1]);
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
    const title = decoded.replace(/_/g, " ").trim();
    return title.length > 0 ? { ok: true, title } : { ok: false, reason: "empty_title" };
  }
  return { ok: true, title: trimmed };
}
