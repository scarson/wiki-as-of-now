// ABOUTME: Home page — look up a Wikipedia article by title and view its detected stale claims.
// ABOUTME: Client component: POSTs to /api/articles/lookup and renders the persisted candidates.
"use client";

import { useState } from "react";

interface Candidate {
  id: number;
  sectionHeading: string;
  sentenceText: string;
  year: number;
  marker: string;
  score: number;
  explanation: string;
}

interface LookupResult {
  pageId: number;
  title: string;
  revisionId: number;
  candidateCount: number;
  candidates: Candidate[];
}

export default function Home() {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string>("");

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (trimmed.length === 0) return;

    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/articles/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: trimmed }),
      });
      const body = (await res.json()) as { error?: string } & Partial<LookupResult>;
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
        setStatus("error");
        return;
      }
      setResult(body as LookupResult);
      setStatus("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">WikiAsOfNow</h1>
        <p className="mt-2 text-sm opacity-70">
          Enter a Wikipedia article title to find time-bound claims that may now be stale. Detection is
          fully deterministic — no AI writes or judges anything here.
        </p>
      </header>

      <form onSubmit={lookup} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Artemis program"
          aria-label="Wikipedia article title"
          className="flex-1 rounded-md border border-black/15 dark:border-white/20 bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:focus:border-white/50"
        />
        <button
          type="submit"
          disabled={status === "loading" || title.trim().length === 0}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {status === "loading" ? "Looking up…" : "Look up"}
        </button>
      </form>

      {status === "error" && (
        <p role="alert" className="mt-6 rounded-md border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm">
          {error}
        </p>
      )}

      {status === "done" && result && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">
            {result.title}{" "}
            <span className="font-normal opacity-60">
              — {result.candidateCount} candidate{result.candidateCount === 1 ? "" : "s"}
            </span>
          </h2>
          <p className="mt-1 text-xs opacity-50">
            page {result.pageId} · revision {result.revisionId}
          </p>

          {result.candidates.length === 0 ? (
            <p className="mt-6 text-sm opacity-70">No stale candidates found in this article.</p>
          ) : (
            <ul className="mt-6 space-y-4">
              {result.candidates.map((c) => (
                <li key={c.id} className="rounded-lg border border-black/10 dark:border-white/15 p-4">
                  <p className="text-sm leading-relaxed">{c.sentenceText}</p>
                  <p className="mt-2 text-sm opacity-75">{c.explanation}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-black/[.06] dark:bg-white/[.10] px-2 py-1">year {c.year}</span>
                    <span className="rounded-full bg-black/[.06] dark:bg-white/[.10] px-2 py-1">marker “{c.marker}”</span>
                    {c.sectionHeading && (
                      <span className="rounded-full bg-black/[.06] dark:bg-white/[.10] px-2 py-1">
                        § {c.sectionHeading}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
