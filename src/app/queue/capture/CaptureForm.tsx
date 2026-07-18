// ABOUTME: Ad-hoc capture form — paste a Wikipedia title or URL, POST /api/queue/capture, render the LookupResult.
// ABOUTME: Client-side parseWikiTarget pre-validation (defense in depth — the server route re-validates).
"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StaleSentence } from "@/app/worksheet/components/StaleSentence";
import { wikipediaArticleUrl, wikipediaSectionUrl } from "@/wikipedia/article-url";
import { reasonLabel } from "@/worksheet/reason-label";
import { parseWikiTarget } from "@/app/queue/parse-wiki-target";

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
  eligibility: "easy_win" | "human_only";
  reasons: string[];
}

export function CaptureForm() {
  const searchParams = useSearchParams();
  const [target, setTarget] = useState(() => searchParams.get("target") ?? "");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string>("");

  const preValidation = target.trim().length > 0 ? parseWikiTarget(target) : null;
  const clientInvalid = preValidation !== null && !preValidation.ok;

  async function capture(e: React.FormEvent) {
    e.preventDefault();
    const norm = parseWikiTarget(target);
    if (!norm.ok) {
      setError("Paste a Wikipedia article title or a /wiki/ URL.");
      setStatus("error");
      return;
    }
    setStatus("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/queue/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target: norm.title }),
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
    <div>
      <form onSubmit={capture} className="flex gap-2">
        <input
          type="text"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Paste a Wikipedia title or URL"
          aria-label="Wikipedia article title or URL"
          aria-invalid={clientInvalid}
          className="flex-1 rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none focus-visible:ring-2 focus-visible:ring-iron-gall"
        />
        <button
          type="submit"
          disabled={status === "loading" || target.trim().length === 0 || clientInvalid}
          className="rounded-md bg-ledger-olive px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
        >
          {status === "loading" ? "Capturing…" : "Capture"}
        </button>
      </form>

      {clientInvalid && (
        <p className="mt-2 text-xs text-dust-gray">
          Not a Wikipedia article title or /wiki/ URL.
        </p>
      )}

      {status === "error" && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray"
        >
          {error}
        </p>
      )}

      {status === "done" && result && (
        <section className="mt-8">
          <h2 className="font-serif text-lg font-medium text-ink-white">
            <a
              href={wikipediaArticleUrl(result.title)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-iron-gall underline-offset-2 hover:underline"
            >
              {result.title}
            </a>{" "}
            <span className="font-normal text-dust-gray">
              — {result.candidateCount} candidate{result.candidateCount === 1 ? "" : "s"}
            </span>
          </h2>
          <p className="mt-1 font-mono text-xs text-dust-gray">
            page {result.pageId} · revision {result.revisionId}
          </p>

          {result.eligibility === "easy_win" ? (
            <p className="mt-4 inline-block rounded-full bg-ledger-olive-shadow px-3 py-1 text-xs font-medium text-ledger-olive-bright">
              easy win
            </p>
          ) : (
            <div className="mt-4 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray">
              <p className="font-medium text-ink-white">Human-only — excluded from the easy-win lane</p>
              {result.reasons.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-dust-gray">
                  {result.reasons.map((r) => (
                    <li key={r}>{reasonLabel(r)}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {result.candidates.length === 0 ? (
            <p className="mt-6 text-sm text-dust-gray">No stale candidates found in this article.</p>
          ) : (
            <ul className="mt-6 space-y-4">
              {result.candidates.map((c) => (
                <li key={c.id} className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
                  <Link
                    href={`/worksheet/${c.id}`}
                    className="block text-sm leading-relaxed text-iron-gall underline-offset-2 hover:underline"
                  >
                    <StaleSentence sentenceText={c.sentenceText} marker={c.marker} />
                  </Link>
                  <p className="mt-2 text-sm text-dust-gray">{c.explanation}</p>
                  <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
                    <span className="rounded-full bg-rust-shadow px-2 py-1 text-oxidized-rust">
                      stale · {c.year}
                    </span>
                    {c.sectionHeading && (
                      <a
                        href={wikipediaSectionUrl(result.title, c.sectionHeading)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-full bg-shelf-gray px-2 py-1 text-iron-gall underline-offset-2 hover:underline"
                      >
                        § {c.sectionHeading}
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
