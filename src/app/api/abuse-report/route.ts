// ABOUTME: POST /api/abuse-report — records a codes-only abuse report and returns the public issue-tracker URL.
// ABOUTME: Thin glue: resolves the D1 binding, validates via src/abuse/report, never persists reporter PII (G13/CC-12).
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { recordAbuseReport } from "@/abuse/report";
import { aboutContent } from "@/about/compliance-content";

export const dynamic = "force-dynamic";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

export async function POST(request: Request): Promise<Response> {
  let body: { category?: string; claimKey?: string };
  try {
    body = (await request.json()) as { category?: string; claimKey?: string };
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }
  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);
  // recordAbuseReport drops any free-text fields on the input; only the category code
  // and an optional claim key are ever persisted to the append-only audit log.
  const result = await recordAbuseReport(db, { category: String(body.category ?? ""), claimKey: body.claimKey });
  if (!result.ok) return json({ error: result.error }, 400);
  return json({ ok: true, reportAt: aboutContent().abuseReportUrl }, 200);
}
