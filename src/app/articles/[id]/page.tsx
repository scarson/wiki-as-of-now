// ABOUTME: Article view (server component) — renders a page's persisted stale candidates with the rust stale marker.
// ABOUTME: Eligibility badge + deterministic explanation per candidate; each candidate links to its research worksheet.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getArticleByPageId, getCandidatesByPageId } from "@/db/articles";
import { getVerdict } from "@/db/eligibility-verdicts";
import { GATE_VERSION } from "@/safelane/eligibility";
import { reasonLabel } from "@/worksheet/reason-label";
import { StaleSentence } from "@/app/worksheet/components/StaleSentence";

export const dynamic = "force-dynamic";

export default async function ArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) notFound();

  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);

  const article = await getArticleByPageId(db, pageId);
  if (article === null) notFound();

  const candidates = await getCandidatesByPageId(db, pageId);
  const verdict = await getVerdict(db, pageId, article.revisionId, GATE_VERSION);
  const eligibility = verdict?.eligibility ?? null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-xs text-dust-gray">
        page {article.pageId} · revision {article.revisionId}
      </p>
      <h1 className="mt-3 font-serif text-2xl leading-snug text-ink-white" style={{ textWrap: "balance" }}>
        {article.title}
      </h1>

      {eligibility === "easy_win" ? (
        <p className="mt-4 inline-block rounded-full bg-ledger-olive-shadow px-3 py-1 text-xs font-medium text-ledger-olive-bright">
          easy win
        </p>
      ) : eligibility === "human_only" ? (
        <div className="mt-4 rounded-md border border-hairline-gray bg-shelf-gray px-4 py-3 text-sm text-body-gray">
          <p className="font-medium text-ink-white">Human-only — excluded from the easy-win lane</p>
          {verdict && verdict.reasons.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-dust-gray">
              {verdict.reasons.map((r) => (
                <li key={r}>{reasonLabel(r)}</li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {candidates.length === 0 ? (
        <p className="mt-8 text-sm text-dust-gray">No stale candidates found in this article.</p>
      ) : (
        <ul className="mt-8 space-y-4">
          {candidates.map((c) => (
            <li key={c.id} className="rounded-lg border border-hairline-gray bg-shelf-gray p-4">
              <Link
                href={`/worksheet/${c.id}`}
                className="block text-[0.95rem] leading-relaxed text-iron-gall underline-offset-2 hover:underline"
              >
                <StaleSentence sentenceText={c.sentenceText} marker={c.marker} />
              </Link>
              <p className="mt-2 text-sm text-dust-gray">{c.explanation}</p>
              <div className="mt-3 flex flex-wrap gap-2 font-mono text-xs">
                <span className="rounded-full bg-rust-shadow px-2 py-1 text-oxidized-rust">stale · {c.year}</span>
                {c.sectionHeading && (
                  <span className="rounded-full bg-shelf-gray px-2 py-1 text-dust-gray">§ {c.sectionHeading}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
