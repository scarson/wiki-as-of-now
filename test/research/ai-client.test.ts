// ABOUTME: Tests the env.AI text-client seam — the one place that touches the AI binding.
// ABOUTME: Every failure (reject, timeout-abort, empty response) maps to ProviderUnavailableError (CC-15).
import { describe, it, expect, vi } from "vitest";
import { makeAiTextClient } from "../../src/research/ai-client";
import { ProviderUnavailableError } from "../../src/research/provider";

/** Minimal fake of the env.AI binding: run() resolves with { response }. */
function fakeAi(response: string) {
  return { run: vi.fn(async () => ({ response })) };
}

describe("makeAiTextClient.generateText", () => {
  it("passes the model id + prompt + max_tokens + abort signal to env.AI.run and returns the response string", async () => {
    const ai = fakeAi('{"queries":["a"]}');
    const client = makeAiTextClient(ai as never);
    const out = await client.generateText("@cf/google/gemma-4-26b-a4b-it", "PROMPT", { maxTokens: 512, timeoutMs: 28_000 });
    expect(out).toBe('{"queries":["a"]}');
    const [model, inputs, options] = ai.run.mock.calls[0];
    expect(model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(inputs).toMatchObject({ prompt: "PROMPT", max_tokens: 512 });
    expect((options as { signal?: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });

  it("throws ProviderUnavailableError when env.AI.run rejects (binding/transport failure)", async () => {
    const ai = { run: vi.fn(async () => { throw new Error("AI capacity exceeded"); }) };
    const client = makeAiTextClient(ai as never);
    await expect(
      client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError (not a generic AbortError) when the call exceeds timeoutMs", async () => {
    const ai = { run: vi.fn((_m: unknown, _i: unknown, opts: { signal: AbortSignal }) =>
      new Promise((_res, rej) => { opts.signal.addEventListener("abort", () => rej(new Error("aborted"))); })) };
    const client = makeAiTextClient(ai as never);
    await expect(
      client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError when the model returns no usable response string", async () => {
    const ai = { run: vi.fn(async () => ({})) }; // no `response` field
    const client = makeAiTextClient(ai as never);
    await expect(
      client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
