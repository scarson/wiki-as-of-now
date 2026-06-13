// ABOUTME: GET /api/research/:candidateId/pack — surfaces the verified research pack for the worksheet, re-validating
// ABOUTME: revision drift on open (build design surface #3). Never surfaces a drifted pack silently — it returns state.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { getCandidateById } from "@/db/candidate-lookup";
import { getArticleByPageId } from "@/db/articles";
import { computeClaimKey } from "@/db/research-packs";
import { surfaceResearchPack } from "@/research/surface-pack";
import type { SqlExecutor } from "@/db/client";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function handlePackRead(db: SqlExecutor, candidateId: number): Promise<Response> {
  if (!Number.isInteger(candidateId) || candidateId <= 0) return json({ error: "Candidate id must be a positive integer" }, 400);
  const candidate = await getCandidateById(db, candidateId);
  if (candidate === null) return json({ error: "Candidate not found" }, 404);

  const article = await getArticleByPageId(db, candidate.pageId);
  if (article === null) return json({ error: "Article not found" }, 404);

  const claimKey = await computeClaimKey(candidate.pageId, candidate.sectionHeading, candidate.sentenceText, candidate.year);
  const surfaced = await surfaceResearchPack(db, { pageId: candidate.pageId, claimKey, currentRevisionId: article.revisionId });
  return json(surfaced, 200); // 200 for every non-error state — including revision_drift/not_found, which the UI flags.
}

export async function GET(_request: Request, { params }: { params: Promise<{ candidateId: string }> }): Promise<Response> {
  const { candidateId } = await params;
  const { env } = getCloudflareContext();          // inside the handler body (CC-11)
  const db = d1Executor(env.DB);
  return handlePackRead(db, Number(candidateId));
}
