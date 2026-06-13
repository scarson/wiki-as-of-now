// ABOUTME: JSON parse + schema-validate gate for model output — parses, validates, never throws.
// ABOUTME: The caller drives the single retry (MODEL_CONFIG.jsonRetries); the deterministic checker is the final backstop.
export type JsonGateResult<T> = { ok: true; value: T } | { ok: false };

/** Strip a leading/trailing markdown code fence if present (Gemma often wraps JSON). */
function stripFence(raw: string): string {
  const t = raw.trim();
  const fenced = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : t;
}

export function parseModelJson<T>(raw: string, validate: (v: unknown) => v is T): JsonGateResult<T> {
  const body = stripFence(raw);
  if (body === "") return { ok: false };
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return { ok: false }; }
  return validate(parsed) ? { ok: true, value: parsed } : { ok: false };
}
