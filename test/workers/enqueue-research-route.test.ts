// ABOUTME: Workers-pool tests for POST /api/queue/enqueue-research request-level hardening — same-origin
// ABOUTME: guard (SameSite=Lax sibling-subdomain CSRF), batch-size cap, and candidate-id de-duplication.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { testEnv } from "./test-env";
import { issueSession } from "../../src/auth/session";
import { d1Executor } from "../../src/db/client";
import { upsertArticle, getCandidatesByPageId } from "../../src/db/articles";
import { upsertUser } from "../../src/db/users";
import { upsertVerdict } from "../../src/db/eligibility-verdicts";
import { GATE_VERSION } from "../../src/safelane/eligibility";

const SESSION_SECRET = "enqueue-route-test-secret-32-bytes-xxxx";
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => ({
    env: { DB: testEnv.DB, RESEARCH_QUEUE: testEnv.RESEARCH_QUEUE, SESSION_SECRET, QUOTA_PER_USER_DAILY: "10", QUOTA_GLOBAL_DAILY: "50" },
  }),
}));
const { POST } = await import("../../src/app/api/queue/enqueue-research/route");

const db = () => d1Executor(testEnv.DB);
async function authedReq(userId: string, body: unknown, extraHeaders: Record<string, string> = {}): Promise<Request> {
  const token = await issueSession({ userId }, SESSION_SECRET, { ttlSeconds: 3600 });
  return new Request("https://x/api/queue/enqueue-research", {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `wikinow_session=${token}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe("POST /api/queue/enqueue-research — request-level hardening", () => {
  beforeEach(async () => {
    await testEnv.DB.exec("DELETE FROM quota_ledger");
    await testEnv.DB.exec("DELETE FROM eligibility_verdicts");
    await testEnv.DB.exec("DELETE FROM stale_candidates");
    await testEnv.DB.exec("DELETE FROM articles");
    await testEnv.DB.exec("DELETE FROM users");
  });

  it("rejects a POST whose Origin header does not match the request origin (CSRF) with 403", async () => {
    const res = await POST(await authedReq("u_org", { candidateIds: [1] }, { origin: "https://evil.scarson.io" }));
    expect(res.status).toBe(403);
  });

  it("accepts a POST whose Origin header matches the request origin", async () => {
    // 503 would mean the queue binding is missing; anything but 403 proves the guard passed.
    const res = await POST(await authedReq("u_org2", { candidateIds: [999999] }, { origin: "https://x" }));
    expect(res.status).not.toBe(403);
  });

  it("rejects a candidateIds array larger than the batch cap with 400", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => i + 1);
    const res = await POST(await authedReq("u_cap", { candidateIds: ids }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/at most 50/);
  });

  it("de-duplicates repeated candidate ids — one result per unique candidate", async () => {
    await upsertArticle(db(), { pageId: 777, title: "Dedup X", revisionId: 5, fetchedAt: new Date().toISOString() });
    await db()
      .prepare(
        "INSERT INTO stale_candidates (page_id, section_heading, sentence_text, year, marker, score, explanation, detector_version, source_revision_id) VALUES (?,?,?,?,?,?,?,?,?)",
      )
      .bind(777, "S", "It will finish by 2020.", 2020, "will", 1.0, "Forward claim anchored to 2020.", "1.0.0", 5)
      .run();
    const cid = (await getCandidatesByPageId(db(), 777))[0].id;
    await upsertUser(db(), { userId: "u_dup", identityProvider: "google", identitySubject: "dup", email: "d@e.com", createdAt: new Date().toISOString() });
    await upsertVerdict(db(), { pageId: 777, revisionId: 5, gateVersion: GATE_VERSION, eligibility: "easy_win", reasons: [], evaluatedAt: new Date().toISOString() });

    const res = await POST(await authedReq("u_dup", { candidateIds: [cid, cid, cid] }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { candidateId: number }[] };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].candidateId).toBe(cid);
  });
});
