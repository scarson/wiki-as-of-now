// ABOUTME: Pageview-ranked seed-list page for a topic — fetches /api/seed-lists/[topic] and renders ranked rows.
// ABOUTME: Mono rank + pageview count (Evidence Mono Rule); iron-gall article links into lookup; serif topic headline.
"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface SeedListEntry {
  topic: string;
  rank: number;
  pageId: number;
  articleTitle: string;
  pageviewCount: number;
}
interface SeedListHeader {
  topic: string;
  title: string;
  refreshedAt: string;
  windowStart: string;
  windowEnd: string;
  entryCount: number;
}
interface SeedListResponse {
  state: "found";
  list: SeedListHeader;
  entries: SeedListEntry[];
}

export default function SeedListPage() {
  const params = useParams<{ topic: string }>();
  const topic = params.topic;
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [data, setData] = useState<SeedListResponse | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus("loading");
      setError("");
      try {
        const res = await fetch(`/api/seed-lists/${encodeURIComponent(topic)}`);
        const body = (await res.json()) as { error?: string } & Partial<SeedListResponse>;
        if (cancelled) return;
        if (!res.ok) {
          setError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
          setStatus("error");
          return;
        }
        setData(body as SeedListResponse);
        setStatus("done");
      } catch {
        if (!cancelled) {
          setError("Could not reach the server. Please try again.");
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [topic]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <nav className="mb-3 text-sm">
          <Link href="/queue" className="text-iron-gall underline-offset-2 hover:underline">
            ← Back to the easy-win lane
          </Link>
        </nav>
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink-white">
          {data?.list.title ?? topic}
        </h1>
        <p className="mt-2 text-sm text-dust-gray">
          Articles ranked by Wikipedia pageviews over a trailing 30-day window. Click an article to detect its
          time-bound claims.
        </p>
        {data && (
          <p className="mt-2 font-mono text-xs text-dust-gray">
            window {data.list.windowStart} → {data.list.windowEnd} · {data.list.entryCount} articles · refreshed{" "}
            {data.list.refreshedAt.slice(0, 10)}
          </p>
        )}
      </header>

      {status === "loading" && <p className="text-sm text-dust-gray">Loading seed list…</p>}

      {status === "error" && (
        <p
          role="alert"
          className="rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray"
        >
          {error}
        </p>
      )}

      {status === "done" && data && (
        data.entries.length === 0 ? (
          <p className="text-sm text-dust-gray">No articles in this seed list yet.</p>
        ) : (
          <ol className="space-y-2">
            {data.entries.map((e) => (
              <li
                key={e.rank}
                className="flex items-baseline gap-4 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3"
              >
                <span className="w-8 shrink-0 text-right font-mono text-sm text-dust-gray">{e.rank}</span>
                <Link
                  href={`/queue/capture?target=${encodeURIComponent(e.articleTitle)}`}
                  className="flex-1 text-sm text-iron-gall underline-offset-2 hover:underline"
                >
                  {e.articleTitle}
                </Link>
                <span className="shrink-0 font-mono text-xs text-dust-gray">
                  {e.pageviewCount.toLocaleString()} views
                </span>
              </li>
            ))}
          </ol>
        )
      )}
    </main>
  );
}
