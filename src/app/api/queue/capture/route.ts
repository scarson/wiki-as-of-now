// ABOUTME: POST /api/queue/capture — drop a Wikipedia title or URL into the queue via lookupAndPersist.
// ABOUTME: Thin glue: origin guard → per-IP rate limit (Workers binding) → normalize target → lookupAndPersist.
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { d1Executor } from "@/db/client";
import { lookupAndPersist } from "@/ingest/lookup";
import { ArticleNotFoundError, WikimediaUnavailableError } from "@/ingest/wikimedia";
import { parseWikiTarget } from "@/app/queue/parse-wiki-target";
import { crossOriginRefusal } from "@/auth/origin-guard";

export const dynamic = "force-dynamic";

/** Window length of the CAPTURE_RATE_LIMITER binding (wrangler.jsonc `ratelimits`, both envs). */
const RATE_LIMIT_PERIOD_SECONDS = 60;

/** The Workers Rate Limiting binding surface this route consumes (not surfaced by cf-typegen). */
interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}
interface CaptureRouteBindings {
  CAPTURE_RATE_LIMITER?: RateLimiter;
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

  // Per-IP rate limit via the CAPTURE_RATE_LIMITER binding (per-colo counters).
  // CF-Connecting-IP is set on every edge request; the binding exists on every
  // deployed env — both absent only under local dev/preview, where we fail open.
  const ip = request.headers.get("cf-connecting-ip");
  const limiter = (getCloudflareContext().env as unknown as CaptureRouteBindings).CAPTURE_RATE_LIMITER;
  if (ip !== null && limiter !== undefined) {
    // Fail open on a throwing binding, same as an absent one — the abuse brake
    // must never become an availability dependency for capture.
    let success = true;
    try {
      ({ success } = await limiter.limit({ key: ip }));
    } catch {
      success = true;
    }
    if (!success) {
      // limit() reports only success/failure, so Retry-After is the window length — an upper bound.
      return json({ error: "Too many capture requests from this address — try again shortly" }, 429, {
        "retry-after": String(RATE_LIMIT_PERIOD_SECONDS),
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
