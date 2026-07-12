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
      } catch {
        // Binding failure, capacity (429), timeout-abort — all map to the one caught class (CC-15).
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
        throw new ProviderUnavailableError("model returned no response text");
      }
      return response;
    },
  };
}
