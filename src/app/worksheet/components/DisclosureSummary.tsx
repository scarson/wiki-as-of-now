// ABOUTME: Renders the two-part mechanical edit-summary (G12) in an editable textarea seeded with the combined fill.
// ABOUTME: The summary is the human's to tweak before pasting — human-editable, never a lock (G12).
"use client";

import { useMemo, useState } from "react";
import { buildDisclosureSummary } from "@/worksheet/disclosure";

interface DisclosureSummaryProps {
  modelVersion: string | null;
  sectionHeading: string;
  refCount: number;
}

export function DisclosureSummary({ modelVersion, sectionHeading, refCount }: DisclosureSummaryProps) {
  const seeded = useMemo(
    () => buildDisclosureSummary({ modelVersion, sectionHeading, refCount }).combined,
    [modelVersion, sectionHeading, refCount],
  );
  const [summary, setSummary] = useState(seeded);
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
      <h3 className="font-serif text-base text-ink-white">Edit summary</h3>
      <p className="mt-1 text-xs text-dust-gray">
        A mechanical disclosure naming the AI model is filled in below. It is yours to edit before you paste it into
        the edit summary.
      </p>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        aria-label="Edit summary"
        rows={3}
        className="mt-3 w-full rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
      />
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-md border border-hairline-gray px-3 py-1.5 text-sm text-dust-gray transition"
      >
        {copied ? "Copied" : "Copy edit summary"}
      </button>
    </section>
  );
}
