// ABOUTME: Research worksheet page (server component) — assembles the WorksheetView and renders the compliance loop.
// ABOUTME: Claim + stale marker, honesty banner, revision-drift flag, evidence cards, G5 gate, snippet assembler, G12 disclosure.
import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { loadWorksheetView } from "@/worksheet/load-worksheet-view";
import { StaleSentence } from "@/app/worksheet/components/StaleSentence";
import { HonestyBanner } from "@/app/worksheet/components/HonestyBanner";
import { WorksheetClient } from "@/app/worksheet/components/WorksheetClient";

export const dynamic = "force-dynamic";

export default async function WorksheetPage({ params }: { params: Promise<{ candidateId: string }> }) {
  const { candidateId } = await params;
  const id = Number(candidateId);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const { env } = getCloudflareContext();
  const view = await loadWorksheetView(d1Executor(env.DB), id);
  if (view === null) notFound();

  const accessedDate = new Date().toISOString().slice(0, 10);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-mono text-xs text-dust-gray">
        page {view.claim.pageId} · revision {view.claim.sourceRevisionId} · § {view.claim.sectionHeading}
      </p>

      <h1 className="mt-3 font-serif text-2xl leading-snug text-ink-white" style={{ textWrap: "balance" }}>
        Research worksheet
      </h1>

      <blockquote className="mt-4 text-[0.95rem] leading-relaxed">
        <StaleSentence sentenceText={view.claim.sentenceText} marker={view.claim.marker} />
      </blockquote>
      <p className="mt-2 text-sm text-dust-gray">{view.claim.explanation}</p>

      <div className="mt-6">
        <HonestyBanner honesty={view.honesty} />
      </div>

      <div className="mt-8">
        <WorksheetClient view={view} accessedDate={accessedDate} />
      </div>
    </main>
  );
}
