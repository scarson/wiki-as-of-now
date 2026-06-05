// ABOUTME: Article parser — converts raw wikitext into a structured ParsedArticle.
// ABOUTME: Deterministic and LLM-free; uses wtf_wikipedia for wikitext tokenization.
import wtf from "wtf_wikipedia";
import type { ParsedArticle, Section } from "../domain/types";

/** Input required to parse a Wikipedia article revision. */
export interface ParseInput {
  title: string;
  revisionId: number;
  wikitext: string;
}

/**
 * Parses a Wikipedia article's wikitext into a structured ParsedArticle.
 *
 * Each wtf section becomes a Section with its heading (empty string for the
 * lead), depth level, and trimmed non-empty sentences. Delegates all wikitext
 * tokenization to wtf_wikipedia — no hand-rolled parsing.
 */
export function parseArticle(input: ParseInput): ParsedArticle {
  const doc = wtf(input.wikitext);
  const wtfSections = doc.sections();

  const sections: Section[] = wtfSections.map(s => {
    // Section.sentences() is typed as object | object[] in the bundled declarations;
    // cast to the Sentence shape we need (text() method confirmed in wtf docs and tests).
    const rawSentences = s.sentences() as Array<{ text(): string }>;
    const sentences = (Array.isArray(rawSentences) ? rawSentences : [rawSentences])
      .map(x => ({ text: x.text().trim() }))
      .filter(u => u.text.length > 0);

    return {
      heading: s.title(),
      level: s.depth(),
      sentences,
    };
  });

  return {
    title: input.title,
    revisionId: input.revisionId,
    sections,
  };
}
