// ABOUTME: Home page — look up a Wikipedia article by title and view its detected stale claims.
// ABOUTME: Client component: POSTs to /api/articles/lookup and renders the persisted candidates.
"use client";

import { useState } from "react";
import Link from "next/link";
import { StaleSentence } from "@/app/worksheet/components/StaleSentence";
import { reasonLabel } from "@/worksheet/reason-label";
import { wikipediaArticleUrl, wikipediaSectionUrl } from "@/wikipedia/article-url";
import { useBrowseAuthState } from "./auth-state";

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

export default function Home() {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string>("");
  // Auth status aliased: Home() already uses `status` for the lookup lifecycle.
  const { status: authStatus } = useBrowseAuthState();

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
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink-white">WikiAsOfNow</h1>
        <p className="mt-2 text-sm text-dust-gray">
          Enter a Wikipedia article title to find time-bound claims that may now be stale. Detection is
          fully deterministic — no AI writes or judges anything here.
        </p>
      </header>

      {/* Auth-aware browse signpost. Browsing is open to everyone; requesting research is gated behind
          sign-in. This banner is advisory only — the server enqueue gate (→ 401 for anonymous) is the
          authoritative access control, not this UI. While auth is unknown the guest banner renders
          invisibly so the reserved height matches the resolved banner exactly at every viewport width
          (a fixed min-h under-reserved once the text wrapped on narrow screens). */}
      <div className="mb-8">
        <div
          aria-hidden={authStatus === "unknown"}
          className={`rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-dust-gray ${
            authStatus === "unknown" ? "invisible" : ""
          }`}
        >
          {authStatus === "authenticated" ? (
            <>You&apos;re signed in — select a claim and request research on it.</>
          ) : (
            <>
              Browsing as a guest — detected claims are open to read.{" "}
              <a href="/api/auth/google" className="text-iron-gall underline-offset-2 hover:underline">
                Sign in
              </a>{" "}
              to request research on a claim.
            </>
          )}
        </div>
      </div>

      <form onSubmit={lookup} className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Artemis program"
          aria-label="Wikipedia article title"
          className="flex-1 rounded-md border border-hairline-gray bg-transparent px-3 py-2 text-sm text-body-gray outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading" || title.trim().length === 0}
          className="rounded-md bg-ledger-olive px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
        >
          {status === "loading" ? "Looking up…" : "Look up"}
        </button>
      </form>

      {status === "error" && (
        <p role="alert" className="mt-6 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray">
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
                    <span className="rounded-full bg-rust-shadow px-2 py-1 text-oxidized-rust">stale · {c.year}</span>
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

      <footer className="mt-12 flex gap-4 border-t border-hairline-gray pt-4 text-xs text-dust-gray">
        <Link href="/about" className="text-iron-gall underline-offset-2 hover:underline">
          About &amp; compliance
        </Link>
        <Link href="/privacy" className="text-iron-gall underline-offset-2 hover:underline">
          Privacy
        </Link>
      </footer>
    </main>
  );
}
