// ABOUTME: Thin seam over the env.AI binding — one text-generation call wrapped in an AbortController timeout.
// ABOUTME: Maps ANY binding/timeout/empty-response failure to ProviderUnavailableError (only that class is pipeline-caught, CC-15).
import { ProviderUnavailableError } from "./provider";

/** Structural shape of the env.AI binding's run() we depend on (Gemma 4 isn't in the generated AiModels union). */
export interface AiRunner {
  run(
    model: string,
    inputs: { messages: { role: string; content: string }[]; max_tokens: number },
    options: { signal: AbortSignal },
  ): Promise<unknown>;
}

export interface AiTextClient {
  generateText(model: string, prompt: string, opts: { maxTokens: number; timeoutMs: number }): Promise<string>;
}

export function makeAiTextClient(ai: AiRunner): AiTextClient {
  return {
    async generateText(model, prompt, opts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
      let raw: unknown;
      try {
        // Chat/messages mode is load-bearing: raw `prompt` mode bypasses the chat template, and
        // instruction-tuned Gemma 4 then free-continues the text instead of following it.
        raw = await ai.run(
          model,
          { messages: [{ role: "user", content: prompt }], max_tokens: opts.maxTokens },
          { signal: controller.signal },
        );
      } catch (e) {
        // Binding failure, capacity (429), timeout-abort — all map to the one caught class (CC-15).
        // Codes-only observability (G13): the error CLASS name, never its message text.
        console.warn("research.ai_call.failed", { reason: e instanceof Error ? e.name : "unknown" });
        throw new ProviderUnavailableError();
      } finally {
        clearTimeout(timer);
      }
      // Envelope shapes across Workers AI text models: OpenAI-compatible chat.completion
      // { choices: [{ message: { content } }] } (what Gemma 4 returns in messages mode; a
      // `reasoning` sibling may hold thinking text), text_completion { choices: [{ text }] },
      // and the legacy { response }. A reasoning model can burn the whole token budget on
      // thinking and return content: null — that is "no usable text", not a string to pass on.
      const shaped = raw as {
        response?: unknown;
        choices?: { text?: unknown; message?: { content?: unknown } }[];
      };
      const first = shaped.choices?.[0];
      const response =
        typeof shaped.response === "string" ? shaped.response
        : typeof first?.message?.content === "string" ? first.message.content
        : first?.text;
      if (typeof response !== "string" || response.length === 0) {
        // Codes-only: finish_reason distinguishes reasoning-burn ("length") from a shape mismatch.
        const finish = (first as { finish_reason?: unknown } | undefined)?.finish_reason;
        console.warn("research.ai_call.empty", { finish: typeof finish === "string" ? finish : "unknown" });
        throw new ProviderUnavailableError("model returned no response text");
      }
      return response;
    },
  };
}
