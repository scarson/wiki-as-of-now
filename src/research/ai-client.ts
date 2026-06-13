// ABOUTME: Thin seam over the env.AI binding — one text-generation call wrapped in an AbortController timeout.
// ABOUTME: Maps ANY binding/timeout/empty-response failure to ProviderUnavailableError (only that class is pipeline-caught, CC-15).
import { ProviderUnavailableError } from "./provider";

/** Structural shape of the env.AI binding's run() we depend on (Gemma 4 isn't in the generated AiModels union). */
export interface AiRunner {
  run(model: string, inputs: { prompt: string; max_tokens: number }, options: { signal: AbortSignal }): Promise<unknown>;
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
        raw = await ai.run(model, { prompt, max_tokens: opts.maxTokens }, { signal: controller.signal });
      } catch {
        // Binding failure, capacity (429), timeout-abort — all map to the one caught class (CC-15).
        throw new ProviderUnavailableError();
      } finally {
        clearTimeout(timer);
      }
      const response = (raw as { response?: unknown }).response;
      if (typeof response !== "string" || response.length === 0) {
        throw new ProviderUnavailableError("model returned no response text");
      }
      return response;
    },
  };
}
