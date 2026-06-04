<!-- ABOUTME: Provenance/evidence trail for the Wikipedia GenAI compliance social contract. -->
<!-- ABOUTME: Faithful full-text transcriptions of the source pages the contract quotes. -->

# Compliance sources — evidence trail

These are full-text transcriptions of the Wikipedia pages quoted by the sacrosanct
compliance contract (`../wikipedia-genai-compliance.md`). They exist so every quotation
in the contract can be checked against primary text without trusting a lossy summarizer.

Captured 2026-06-04 with the `url-to-markdown` skill (faithful transcription, YAML
frontmatter includes `source_url`, `fetched`, `http_status`, and `content_hash_sha256`).

| File | Source page | Contract use |
|------|-------------|--------------|
| `2026-06-01-wikipedia-writing-articles-with-large-language-models-wikipedia.md` | Wikipedia:Writing articles with large language models (the guideline) | the content-generation prohibition; carve-outs; enforcement framing |
| `2026-03-20-wikipedia-writing-articles-with-large-language-models-rfc-wikipedia.md` | …/RfC | close date; the scope statement that research-assistant / citation-tool use is not restricted |
| `2026-04-08-wikipedia-llms-are-bad-search-engines-wikipedia.md` | Wikipedia:LLMs are bad search engines (essay) | the source-finding caution; the five intent concerns |
| `2026-02-26-wikipedia-artificial-intelligence-wikipedia.md` | Wikipedia:Artificial intelligence | editor-facing AI guidance hub |
| `2013-04-11-wikipedia-reliable-sources-wikipedia.md` | Wikipedia:Reliable sources | "generally unreliable" ML-output passage; hallucinated-citations |
| `2026-04-29-wikipedia-llm-use-disclosure-wikipedia.md` | Wikipedia:LLM use disclosure | disclosure is highly encouraged; identify AI name + version in the edit summary |

(Filename dates come from each page's extracted publish/last-modified metadata, not the
fetch date; the fetch timestamp is in each file's frontmatter.)

**Maintenance:** Wikipedia pages evolve. Re-run `url-to-markdown` on these URLs on a
recurring cadence and before any public republication of the contract, and reconcile any
changed wording. The `content_hash_sha256` in each file's frontmatter makes drift
detection cheap.
