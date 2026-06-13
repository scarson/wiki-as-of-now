// ABOUTME: Enqueues research for a set of persisted candidate ids — sequential producer loop (G14-adjacent).
// ABOUTME: Reads each candidate from D1, builds the ResearchInput, calls enqueueResearch (which computes claimKey).
import type { SqlExecutor } from "../db/client";
import { getCandidateById } from "../db/candidate-lookup"; // Phase 2 Task 2.2 — single home for this reader
import { enqueueResearch, type ResearchMessage } from "./research-jobs";

export interface EnqueueResult {
  accepted: number[];
  skipped: number[];
}

export async function enqueueCandidatesForResearch(
  db: SqlExecutor,
  queue: { send(message: ResearchMessage): Promise<void> },
  candidateIds: number[]
): Promise<EnqueueResult> {
  const accepted: number[] = [];
  const skipped: number[] = [];
  for (const id of candidateIds) {
    // sequential, never Promise.all
    const c = await getCandidateById(db, id);
    if (!c) {
      skipped.push(id);
      continue;
    }
    await enqueueResearch(queue, {
      pageId: c.pageId,
      sourceRevisionId: c.sourceRevisionId,
      input: {
        claimText: c.sentenceText,
        sectionHeading: c.sectionHeading,
        year: c.year,
        sourceRevisionId: c.sourceRevisionId,
      },
    });
    accepted.push(id);
  }
  return { accepted, skipped };
}
