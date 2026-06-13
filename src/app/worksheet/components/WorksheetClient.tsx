// ABOUTME: Client orchestrator for the worksheet — holds per-source G5 open-state and reveals the assembler/disclosure.
// ABOUTME: The snippet assembler + disclosure are gated behind at least one opened+logged source (G5); thin glue only.
"use client";

import { useState } from "react";
import type { WorksheetView } from "@/worksheet/view-types";
import { EvidenceCard } from "./EvidenceCard";
import { SourceOpenGate } from "./SourceOpenGate";
import { SnippetAssembler } from "./SnippetAssembler";
import { DisclosureSummary } from "./DisclosureSummary";

interface WorksheetClientProps {
  view: WorksheetView;
  accessedDate: string;
}

export function WorksheetClient({ view, accessedDate }: WorksheetClientProps) {
  const [openedUrls, setOpenedUrls] = useState<Set<string>>(new Set());
  const markOpened = (url: string) => setOpenedUrls((prev) => new Set(prev).add(url));

  const openedList = view.cards.filter((c) => openedUrls.has(c.url));
  const anyOpened = openedList.length > 0;
  // Use the first opened source as the citation target for the assembler.
  const citationUrl = openedList[0]?.url ?? null;

  if (view.cards.length === 0) {
    return null; // no verbatim cards to act on; the honesty banner already explains why
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="font-serif text-lg text-ink-white">Evidence</h2>
        {view.cards.map((card) => (
          <div key={card.url}>
            <EvidenceCard card={card} />
            <SourceOpenGate
              claimKey={view.claimKey}
              sourceRevisionId={view.claim.sourceRevisionId}
              url={card.url}
              opened={openedUrls.has(card.url)}
              onOpened={markOpened}
            />
          </div>
        ))}
      </section>

      {anyOpened && citationUrl ? (
        <>
          <SnippetAssembler url={citationUrl} accessedDate={accessedDate} />
          <DisclosureSummary
            modelVersion={view.modelVersion}
            sectionHeading={view.claim.sectionHeading}
            refCount={openedList.length}
          />
        </>
      ) : (
        <p className="text-sm text-dust-gray">
          Open and confirm at least one source above to build a citation.
        </p>
      )}
    </div>
  );
}
