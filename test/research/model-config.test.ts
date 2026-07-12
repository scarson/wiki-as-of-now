// ABOUTME: Tests the pinned Workers AI model config — full model ids (G12) + per-call bounds.
// ABOUTME: The pinned values are load-bearing for disclosure (full id) and JSON robustness (max_tokens).
import { describe, it, expect } from "vitest";
import { MODEL_CONFIG } from "../../src/research/model-config";

describe("MODEL_CONFIG", () => {
  it("pins the primary model to the full Gemma 4 id (G12 disclosure depends on the full id)", () => {
    expect(MODEL_CONFIG.primaryModel).toBe("@cf/google/gemma-4-26b-a4b-it");
  });
  it("pins the escalation backup to kimi-k2.6 (NOT the code-tuned variant)", () => {
    expect(MODEL_CONFIG.escalationModel).toBe("@cf/moonshotai/kimi-k2.6");
    expect(MODEL_CONFIG.escalationModel).not.toContain("-code");
  });
  it("sets an explicit per-call max_tokens (Workers AI silently truncates JSON on the default)", () => {
    expect(MODEL_CONFIG.maxTokens).toBeGreaterThanOrEqual(512);
    expect(Number.isInteger(MODEL_CONFIG.maxTokens)).toBe(true);
  });
  it("bounds the per-call abort budget to cover reasoning generation without masking hangs", () => {
    // Live Gemma 4 is a reasoning model: emitting 2048 tokens took ~26s on real claim prompts,
    // so a 4096-token generation needs ~40-50s. The floor keeps slow-but-progressing generations
    // alive; the ceiling keeps the timeout a genuine hang guard within the queue consumer's wall budget.
    expect(MODEL_CONFIG.callTimeoutMs).toBeGreaterThanOrEqual(45_000);
    expect(MODEL_CONFIG.callTimeoutMs).toBeLessThanOrEqual(120_000);
  });
  it("allows exactly one JSON retry (parse-and-retry gate)", () => {
    expect(MODEL_CONFIG.jsonRetries).toBe(1);
  });
  it("caps generated queries at the G9 count bound (≤8)", () => {
    expect(MODEL_CONFIG.maxQueries).toBe(8);
  });
  it("caps a generated query at the G9 length bound (256 code points)", () => {
    expect(MODEL_CONFIG.maxQueryLen).toBe(256);
  });
  it("caps triage proposals at the pipeline's DEFAULT_MAX_PROPOSALS (5)", () => {
    expect(MODEL_CONFIG.maxProposals).toBe(5);
  });
  it("bounds research() fetch + triage volume so the triage prompt cannot overflow Gemma's context", () => {
    expect(MODEL_CONFIG.maxCandidateUrls).toBe(12);
    expect(MODEL_CONFIG.perQueryHitCap).toBe(3);
    expect(MODEL_CONFIG.perPageChars).toBe(4000);
    expect(MODEL_CONFIG.maxTriagePages).toBe(12);
    expect(MODEL_CONFIG.braveCount).toBe(5);
  });
});
