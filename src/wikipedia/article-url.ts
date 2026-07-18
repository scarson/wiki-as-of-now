// ABOUTME: Pure builders for links to the CURRENT English Wikipedia article + section anchor (never a revision-pinned URL).
// ABOUTME: Section-anchor drift (heading renamed since detection) degrades to top-of-article — acceptable per design.
const BASE = "https://en.wikipedia.org/wiki/";

/** MediaWiki-style token: spaces → underscores, then percent-encode. encodeURIComponent keeps _ - . intact. */
function toToken(text: string): string {
  return encodeURIComponent(text.trim().replace(/ /g, "_"));
}

export function wikipediaArticleUrl(title: string): string {
  return BASE + toToken(title);
}

export function wikipediaSectionUrl(title: string, sectionHeading: string): string {
  const url = wikipediaArticleUrl(title);
  return sectionHeading.trim() ? `${url}#${toToken(sectionHeading)}` : url;
}
