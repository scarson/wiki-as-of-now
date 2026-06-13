// ABOUTME: JSON parse + schema-validate gate for model output — parses, validates, never throws.
// ABOUTME: The caller drives the single retry (MODEL_CONFIG.jsonRetries); the deterministic checker is the final backstop.
export type JsonGateResult<T> = { ok: true; value: T } | { ok: false };

/** Strip a leading/trailing markdown code fence if present (Gemma often wraps JSON). */
function stripWholeFence(raw: string): string {
  const t = raw.trim();
  const fenced = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  return fenced ? fenced[1].trim() : t;
}

/**
 * Extract the first NON-ANCHORED fenced block, anywhere in the output (Gemma commonly emits
 * prose-then-fenced-JSON or a fence mid-paragraph). Returns null when no fence is present.
 */
function extractFencedBlock(raw: string): string | null {
  const m = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return m ? m[1].trim() : null;
}

/**
 * Slice the first BALANCED JSON object/array out of arbitrary text: scan from the first `{` or `[`
 * to its matching close, respecting strings and escapes (so a brace/bracket inside a string literal
 * does not throw off the depth count). Returns null when no balanced span is found.
 */
function sliceBalancedJson(raw: string): string | null {
  const start = raw.search(/[[{]/);
  if (start === -1) return null;
  const open = raw[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null; // unbalanced — no complete span
}

/** Parse a candidate string to JSON, returning null on any parse failure (never throws). */
function tryParse(body: string): unknown | null {
  if (body.trim() === "") return null;
  try { return JSON.parse(body); } catch { return null; }
}

/**
 * Parse + schema-validate model output. Total and throw-free. After a direct parse of the
 * (whole-fence-stripped) output fails, fall back to a non-anchored fenced-block extract, then to
 * slicing the first balanced JSON object/array out of surrounding prose. Returns ok:false when
 * nothing parses to the expected shape.
 */
export function parseModelJson<T>(raw: string, validate: (v: unknown) => v is T): JsonGateResult<T> {
  const fenced = extractFencedBlock(raw);
  const candidates = [
    stripWholeFence(raw),                       // bare JSON or a fence spanning the whole output
    fenced,                                     // a fenced block anywhere in the output
    fenced !== null ? sliceBalancedJson(fenced) : null, // balanced span inside the fence (fence + prose)
    sliceBalancedJson(raw),                     // first balanced object/array in raw prose (no fence)
  ];
  for (const candidate of candidates) {
    if (candidate === null) continue;
    const parsed = tryParse(candidate);
    if (parsed !== null && validate(parsed)) return { ok: true, value: parsed };
  }
  return { ok: false };
}
