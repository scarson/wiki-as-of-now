// ABOUTME: The snippet assembler — the HUMAN writes the sentence; the tool mechanically builds the <ref> from metadata.
// ABOUTME: The textarea value is NEVER passed to buildRefWikitext (G1/G16); a hint discourages pasting the model's quote.
"use client";

import { useMemo, useState } from "react";
import { buildRefWikitext } from "@/worksheet/ref-assembler";

interface SnippetAssemblerProps {
  /** A real, opened source URL the human is citing (from a verified evidence card). */
  url: string;
  /** Today, in ISO date form — the access date for the citation. */
  accessedDate: string;
}

export function SnippetAssembler({ url, accessedDate }: SnippetAssemblerProps) {
  const [sentence, setSentence] = useState("");
  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [copied, setCopied] = useState(false);

  // The ref is built ONLY from deterministic source metadata — NEVER from `sentence` (G1/G16).
  const ref = useMemo(
    () =>
      buildRefWikitext({
        url,
        title: title.trim() || url,
        publisher: publisher.trim() || undefined,
        publishedDate: publishedDate.trim() || undefined,
        accessedDate,
      }),
    [url, title, publisher, publishedDate, accessedDate],
  );

  async function copy() {
    // Copy the human's sentence followed by the mechanical ref — the two are assembled here, never auto-fused upstream.
    await navigator.clipboard.writeText(`${sentence.trim()}${ref}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
      <h3 className="font-serif text-base text-ink-white">Write the sentence in your own words</h3>
      <p className="mt-1 text-xs text-dust-gray">
        You write the sentence; the citation below is built mechanically from the source details. Do not paste the
        source quote as your sentence — summarize the fact in your own words.
      </p>
      <textarea
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        placeholder="Write the updated sentence here, in your own words…"
        aria-label="Your sentence"
        rows={3}
        className="mt-3 w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
      />

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-dust-gray">
          Source title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title shown on the source page"
            className="mt-1 w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
          />
        </label>
        <label className="text-xs text-dust-gray">
          Publisher (optional)
          <input
            value={publisher}
            onChange={(e) => setPublisher(e.target.value)}
            placeholder="Publishing organization"
            className="mt-1 w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
          />
        </label>
        <label className="text-xs text-dust-gray">
          Published date (optional — confirm against the source)
          <input
            value={publishedDate}
            onChange={(e) => setPublishedDate(e.target.value)}
            placeholder="YYYY-MM-DD"
            className="mt-1 w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
          />
        </label>
      </div>

      <p className="mt-4 text-xs text-dust-gray">Mechanical citation (built from the metadata above):</p>
      <pre className="mt-1 overflow-x-auto rounded-md border border-hairline-gray bg-archive-black px-3 py-2 font-mono text-xs text-body-gray">
        {ref}
      </pre>

      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-md border border-hairline-gray px-3 py-1.5 text-sm text-dust-gray transition"
      >
        {copied ? "Copied" : "Copy sentence + citation"}
      </button>
    </section>
  );
}
