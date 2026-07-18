// ABOUTME: POST /api/queue/capture — drop a Wikipedia title or URL into the queue via lookupAndPersist.
// ABOUTME: Thin glue: normalizes the target, resolves DB, delegates to lookupAndPersist, maps typed errors.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { lookupAndPersist } from "@/ingest/lookup";
import { ArticleNotFoundError, WikimediaUnavailableError } from "@/ingest/wikimedia";
import { parseWikiTarget } from "@/app/queue/parse-wiki-target";
import { crossOriginRefusal } from "@/auth/origin-guard";
import {
  createCaptureThrottle,
  loadCaptureThrottleConfig,
  type CaptureThrottle,
} from "@/abuse/capture-throttle";

export const dynamic = "force-dynamic";

// One throttle per isolate; keyed by CF-Connecting-IP, which Cloudflare sets on
// every edge request (absent only under local dev/preview, where we skip).
let throttle: CaptureThrottle | undefined;

/** Runtime-only vars NOT surfaced by cf-typegen (CC-9) — read off env at request time. */
interface CaptureRouteVars {
  CAPTURE_THROTTLE_LIMIT?: string;
  CAPTURE_THROTTLE_WINDOW_SECONDS?: string;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export async function POST(request: Request): Promise<Response> {
  // Before charging the IP budget: a hostile page could otherwise drain a
  // visitor's capture allowance with cross-origin POSTs from their browser.
  const refusal = crossOriginRefusal(request);
  if (refusal) return refusal;
  const ip = request.headers.get("cf-connecting-ip");
  if (ip !== null) {
    throttle ??= createCaptureThrottle(
      loadCaptureThrottleConfig(getCloudflareContext().env as unknown as CaptureRouteVars)
    );
    const decision = throttle.check(ip, Date.now());
    if (!decision.allowed) {
      return json({ error: "Too many capture requests from this address — try again shortly" }, 429, {
        "retry-after": String(decision.retryAfterSeconds),
      });
    }
  }
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const target = (parsed as { target?: unknown })?.target;
  if (typeof target !== "string") return json({ error: "A 'target' title or URL is required" }, 400);
  const norm = parseWikiTarget(target);
  if (!norm.ok) return json({ error: "Not a valid Wikipedia article title or URL" }, 400);
  const { env } = getCloudflareContext();
  const db = d1Executor(env.DB);
  try {
    return json(await lookupAndPersist(db, norm.title), 200);
  } catch (err) {
    if (err instanceof ArticleNotFoundError) return json({ error: err.message }, 404);
    if (err instanceof WikimediaUnavailableError)
      return json({ error: "Wikimedia is temporarily unavailable" }, 503);
    return json({ error: "Capture failed" }, 500);
  }
}
