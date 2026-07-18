// ABOUTME: Easy-win lane / batch-queue page — POSTs /api/easy-win, renders the considered/surfaced/deferred/skipped
// ABOUTME: summary + surfaced items, keyboard-first triage, and a "research selected" action over /api/queue/enqueue-research.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { StaleSentence } from "@/app/worksheet/components/StaleSentence";
import { useBrowseAuthState } from "@/app/auth-state";
import { canRequestResearch } from "@/app/browse-mode";
import { wikipediaArticleUrl, wikipediaSectionUrl } from "@/wikipedia/article-url";

// Client mirrors the API shape locally (never imports server modules — integration-contract §4.6).
interface Candidate {
  id: number;
  sectionHeading: string;
  sentenceText: string;
  year: number;
  marker: string;
  score: number;
  explanation: string;
}
interface EasyWinItem {
  pageId: number;
  title: string;
  revisionId: number;
  candidates: Candidate[];
}
interface EasyWinLaneResult {
  items: EasyWinItem[];
  summary: {
    considered: number;
    surfaced: number;
    deferred: number;
    skipped: { pageId: number; outcome: "demoted" | "revision_drift" | "article_gone" | "fetch_unavailable" }[];
  };
}

const SKIP_LABELS: Record<string, string> = {
  demoted: "demoted from the lane",
  revision_drift: "revision changed since detection",
  article_gone: "article no longer reachable",
  fetch_unavailable: "Wikimedia fetch unavailable",
};

export default function QueuePage() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<EasyWinLaneResult | null>(null);
  const [error, setError] = useState<string>("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [enqueueMsg, setEnqueueMsg] = useState<string>("");
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  // Auth status aliased: this page already uses `status` for the lane lifecycle.
  const { status: authStatus, setAnonymous } = useBrowseAuthState();

  const loadLane = useCallback(async () => {
    setStatus("loading");
    setError("");
    setResult(null);
    setSelected(new Set());
    setEnqueueMsg("");
    try {
      const res = await fetch("/api/easy-win", { method: "POST" });
      const body = (await res.json()) as { error?: string } & Partial<EasyWinLaneResult>;
      if (!res.ok) {
        setError(typeof body.error === "string" ? body.error : `Request failed (${res.status})`);
        setStatus("error");
        return;
      }
      setResult(body as EasyWinLaneResult);
      setStatus("done");
    } catch {
      setError("Could not reach the server. Please try again.");
      setStatus("error");
    }
  }, []);

  // Flatten all candidates across items into a single triage list (page order, then candidate order).
  const flatCandidates: { item: EasyWinItem; candidate: Candidate }[] = useMemo(
    () => result?.items.flatMap((item) => item.candidates.map((candidate) => ({ item, candidate }))) ?? [],
    [result]
  );

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const researchSelected = useCallback(async () => {
    // Proactive gate covering BOTH the button and the r/R keyboard shortcut. Advisory only —
    // the server enqueue gate (401) below remains the authoritative backstop for a session
    // that expires after this check but before the request reaches the server.
    if (authStatus !== "authenticated") {
      setEnqueueMsg("Sign in to request research on these candidates.");
      return;
    }
    const candidateIds = [...selected];
    if (candidateIds.length === 0) {
      setEnqueueMsg("Select at least one candidate to research.");
      return;
    }
    setEnqueueMsg("Sending…");
    try {
      // The route caps one batch at 50 ids — chunk larger selections so a big lane
      // never produces a request the server rejects outright.
      const results: { candidateId: number; outcome: string; reasons?: string[] }[] = [];
      for (let i = 0; i < candidateIds.length; i += 50) {
        const res = await fetch("/api/queue/enqueue-research", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ candidateIds: candidateIds.slice(i, i + 50) }),
        });
        const body = (await res.json()) as {
          error?: string;
          results?: { candidateId: number; outcome: string; reasons?: string[] }[];
        };
        if (!res.ok) {
          // The route requires auth (401 unauthenticated) and honors the kill-switch (503 disabled);
          // surface those distinctly so a signed-out or paused user isn't told the request silently failed.
          if (res.status === 401) {
            // The session expired after the initial auth-state fetch. Reconcile the shared
            // client state so the nav chip, banner, and this control all flip to anonymous
            // (surfacing the sign-in affordance) instead of showing stale authenticated UI.
            setAnonymous();
            setEnqueueMsg("Sign in to request research on these candidates.");
          } else if (res.status === 503) {
            setEnqueueMsg("Research is currently disabled — try again later.");
          } else {
            setEnqueueMsg(typeof body.error === "string" ? body.error : `Enqueue failed (${res.status})`);
          }
          return;
        }
        results.push(...(body.results ?? []));
      }
      const accepted = results.filter((r) => r.outcome === "enqueued").length;
      const skipped = results.length - accepted;
      setEnqueueMsg(
        `Queued ${accepted} for research${skipped > 0 ? `, ${skipped} skipped` : ""}.`
      );
      setSelected(new Set());
    } catch {
      setEnqueueMsg("Could not reach the server. Please try again.");
    }
  }, [selected, authStatus, setAnonymous]);

  // Keyboard-first triage: ↑/↓ move focus, space toggles, r researches the selection.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Let links/controls handle their own keys — Enter on an in-row Wikipedia link
      // must follow the link, not toggle the focused candidate.
      if ((e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
      if (flatCandidates.length === 0) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusIndex((i) => Math.min(i + 1, flatCandidates.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle(flatCandidates[focusIndex].candidate.id);
      } else if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        void researchSelected();
      }
    },
    [flatCandidates, focusIndex, toggle, researchSelected]
  );

  useEffect(() => {
    rowRefs.current[focusIndex]?.focus();
  }, [focusIndex]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-8">
        <h1 className="font-serif text-3xl font-medium tracking-tight text-ink-white">Easy-win lane</h1>
        <p className="mt-2 text-sm text-dust-gray">
          Articles the deterministic gate cleared for the easy-win lane, re-validated at request time. Select
          candidates and send them to async research. Detection is fully deterministic — no AI writes or judges
          anything here.
        </p>
        <nav className="mt-3 flex gap-4 text-sm">
          <Link href="/queue/capture" className="text-iron-gall underline-offset-2 hover:underline">
            Capture an article →
          </Link>
          <Link href="/queue/seed/military-procurement" className="text-iron-gall underline-offset-2 hover:underline">
            Military procurement seed list →
          </Link>
          <Link href="/queue/seed/infrastructure-megaprojects" className="text-iron-gall underline-offset-2 hover:underline">
            Infrastructure megaprojects seed list →
          </Link>
        </nav>
      </header>

      <button
        type="button"
        onClick={loadLane}
        disabled={status === "loading"}
        className="rounded-md bg-ledger-olive px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
      >
        {status === "loading" ? "Loading lane…" : status === "done" ? "Reload lane" : "Load easy-win lane"}
      </button>

      {status === "error" && (
        <p
          role="alert"
          className="mt-6 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray"
        >
          {error}
        </p>
      )}

      {status === "done" && result && (
        <section className="mt-8" aria-label="Easy-win lane results" onKeyDown={onKeyDown}>
          <dl className="grid grid-cols-2 gap-3 font-mono text-xs sm:grid-cols-4">
            <SummaryStat label="considered" value={result.summary.considered} />
            <SummaryStat label="surfaced" value={result.summary.surfaced} accent />
            <SummaryStat label="deferred" value={result.summary.deferred} />
            <SummaryStat label="skipped" value={result.summary.skipped.length} />
          </dl>

          {result.summary.skipped.length > 0 && (
            <ul className="mt-4 space-y-1 text-xs text-dust-gray">
              {result.summary.skipped.map((s) => (
                <li key={s.pageId} className="font-mono">
                  page {s.pageId} — {SKIP_LABELS[s.outcome] ?? s.outcome}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center gap-3">
            {authStatus === "unknown" ? (
              <button
                type="button"
                disabled
                className="rounded-md bg-iron-gall-shadow px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
              >
                Research selected ({selected.size})
              </button>
            ) : canRequestResearch(authStatus) ? (
              <button
                type="button"
                onClick={researchSelected}
                disabled={selected.size === 0}
                className="rounded-md bg-iron-gall-shadow px-4 py-2 text-sm font-medium text-ink-white disabled:opacity-50"
              >
                Research selected ({selected.size})
              </button>
            ) : (
              <a href="/api/auth/google" className="text-sm text-iron-gall underline-offset-2 hover:underline">
                Sign in to request research
              </a>
            )}
            <span aria-live="polite" className="text-xs text-dust-gray">
              {enqueueMsg}
            </span>
          </div>
          <p className="mt-2 text-xs text-dust-gray">
            Keyboard: <kbd className="font-mono">↑</kbd>/<kbd className="font-mono">↓</kbd> move ·{" "}
            <kbd className="font-mono">space</kbd> toggle · <kbd className="font-mono">r</kbd> research selected.
          </p>

          {result.items.length === 0 ? (
            <p className="mt-6 text-sm text-dust-gray">No articles are currently in the easy-win lane.</p>
          ) : (
            <div className="mt-6 space-y-8">
              {result.items.map((item) => (
                <article key={item.pageId}>
                  <h2 className="font-serif text-lg font-medium text-ink-white">
                    <a
                      href={wikipediaArticleUrl(item.title)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-iron-gall underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </a>
                    <span className="ml-2 inline-block rounded-full bg-ledger-olive-shadow px-2 py-0.5 align-middle text-xs font-medium text-ledger-olive-bright">
                      easy win
                    </span>
                  </h2>
                  <p className="mt-1 font-mono text-xs text-dust-gray">
                    page {item.pageId} · revision {item.revisionId}
                  </p>
                  <ul className="mt-3 space-y-3">
                    {item.candidates.map((c) => {
                      const flatIndex = flatCandidates.findIndex((f) => f.candidate.id === c.id);
                      const isSelected = selected.has(c.id);
                      return (
                        <li
                          key={c.id}
                          ref={(el) => {
                            rowRefs.current[flatIndex] = el;
                          }}
                          tabIndex={0}
                          onFocus={() => setFocusIndex(flatIndex)}
                          className={`rounded-lg border p-4 outline-none focus-visible:ring-2 focus-visible:ring-iron-gall ${
                            isSelected
                              ? "border-iron-gall bg-shelf-gray"
                              : "border-hairline-gray bg-shelf-gray"
                          }`}
                        >
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggle(c.id)}
                              aria-label={`Select candidate ${c.id} for research`}
                              className="mt-1 accent-[var(--iron-gall)]"
                            />
                            <span className="flex-1">
                              <Link
                                href={`/worksheet/${c.id}`}
                                className="block text-sm leading-relaxed text-iron-gall underline-offset-2 hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <StaleSentence sentenceText={c.sentenceText} marker={c.marker} />
                              </Link>
                              <span className="mt-2 block text-sm text-dust-gray">{c.explanation}</span>
                              <span className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
                                <span className="rounded-full bg-rust-shadow px-2 py-1 text-oxidized-rust">
                                  stale · {c.year}
                                </span>
                                {c.sectionHeading && (
                                  <a
                                    href={wikipediaSectionUrl(item.title, c.sectionHeading)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="rounded-full bg-shelf-gray px-2 py-1 text-iron-gall underline-offset-2 hover:underline"
                                  >
                                    § {c.sectionHeading}
                                  </a>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function SummaryStat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-md border border-hairline-gray bg-shelf-gray px-3 py-2">
      <dt className="text-dust-gray">{label}</dt>
      <dd className={`mt-1 text-lg ${accent ? "text-ledger-olive-bright" : "text-ink-white"}`}>{value}</dd>
    </div>
  );
}
