// ABOUTME: Tests the env.AI text-client seam — the one place that touches the AI binding.
// ABOUTME: Every failure (reject, timeout-abort, empty response) maps to ProviderUnavailableError (CC-15).
import { describe, it, expect, vi } from "vitest";
import { makeAiTextClient } from "../../src/research/ai-client";
import { ProviderUnavailableError } from "../../src/research/provider";

type ChatInputs = { messages: { role: string; content: string }[]; max_tokens: number };

/** Minimal fake of the env.AI binding: run() resolves with the given envelope. Params declared so mock.calls is typed. */
function fakeAi(envelope: unknown) {
  return {
    run: vi.fn(async (_model: string, _inputs: ChatInputs, _options: { signal: AbortSignal }) => envelope),
  };
}

describe("makeAiTextClient.generateText", () => {
  it("sends the prompt as a single user chat message (Gemma 4 follows instructions only via the chat template) and returns the content", async () => {
    // Verbatim shape (trimmed) observed from a live @cf/google/gemma-4-26b-a4b-it run on
    // 2026-07-12: messages-mode returns an OpenAI-compatible chat.completion envelope whose
    // text lives at choices[0].message.content (a `reasoning` sibling may also be present).
    const envelope = {
      choices: [
        {
          finish_reason: "stop",
          index: 0,
          message: {
            content: '{"queries":["zumwalt commissioning date"]}',
            reasoning: "The user wants neutral queries…",
            role: "assistant",
          },
        },
      ],
      created: 1783836558,
      model: "@cf/google/gemma-4-26b-a4b-it",
      object: "chat.completion",
      usage: { prompt_tokens: 121, completion_tokens: 300, total_tokens: 421 },
    };
    const ai = fakeAi(envelope);
    const client = makeAiTextClient(ai as never);
    const out = await client.generateText("@cf/google/gemma-4-26b-a4b-it", "PROMPT", { maxTokens: 512, timeoutMs: 28_000 });
    expect(out).toBe('{"queries":["zumwalt commissioning date"]}');
    const [model, inputs, options] = ai.run.mock.calls[0];
    expect(model).toBe("@cf/google/gemma-4-26b-a4b-it");
    expect(inputs).toMatchObject({ messages: [{ role: "user", content: "PROMPT" }], max_tokens: 512 });
    expect((inputs as { prompt?: unknown }).prompt).toBeUndefined();
    expect((options as { signal?: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });

  it("still accepts the legacy Workers-AI { response } envelope", async () => {
    const ai = fakeAi({ response: '{"queries":["a"]}' });
    const client = makeAiTextClient(ai as never);
    const out = await client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 });
    expect(out).toBe('{"queries":["a"]}');
  });

  it("still accepts an OpenAI-compatible text_completion envelope (choices[].text)", async () => {
    const ai = fakeAi({ choices: [{ text: '{"queries":["b"]}' }], object: "text_completion" });
    const client = makeAiTextClient(ai as never);
    const out = await client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 });
    expect(out).toBe('{"queries":["b"]}');
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

  it("throws ProviderUnavailableError when the model returns no usable text in any known envelope", async () => {
    const ai = fakeAi({}); // neither response, choices[].text, nor choices[].message.content
    const client = makeAiTextClient(ai as never);
    await expect(
      client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("throws ProviderUnavailableError when reasoning burned the whole budget (content null, finish_reason length)", async () => {
    // Observed live at max_tokens=1024: reasoning consumed every completion token and
    // message.content came back null. The client must treat this as no-usable-text.
    const ai = fakeAi({
      choices: [{ finish_reason: "length", message: { content: null, reasoning: "…4164 chars…", role: "assistant" } }],
      object: "chat.completion",
    });
    const client = makeAiTextClient(ai as never);
    await expect(
      client.generateText("@cf/google/gemma-4-26b-a4b-it", "P", { maxTokens: 512, timeoutMs: 28_000 }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});
