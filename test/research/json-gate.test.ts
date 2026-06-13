// ABOUTME: Tests the JSON parse-and-validate gate — total, throw-free parsing of model output.
// ABOUTME: Covers happy parse, code-fence stripping (Gemma wraps JSON), schema-fail, malformed, empty, whitespace.
import { describe, it, expect } from "vitest";
import { parseModelJson } from "../../src/research/json-gate";

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

describe("parseModelJson", () => {
  it("parses valid JSON that passes the validator", () => {
    expect(parseModelJson('["a","b"]', isStringArray)).toEqual({ ok: true, value: ["a", "b"] });
  });
  it("strips a ```json code fence before parsing (Gemma wraps output)", () => {
    const raw = "```json\n[\"a\"]\n```";
    expect(parseModelJson(raw, isStringArray)).toEqual({ ok: true, value: ["a"] });
  });
  it("strips a bare ``` fence", () => {
    expect(parseModelJson("```\n[\"a\"]\n```", isStringArray)).toEqual({ ok: true, value: ["a"] });
  });
  it("returns ok:false on malformed JSON (does not throw)", () => {
    expect(parseModelJson("{not json", isStringArray)).toEqual({ ok: false });
  });
  it("returns ok:false when JSON parses but fails the validator", () => {
    expect(parseModelJson('[1,2,3]', isStringArray)).toEqual({ ok: false });
  });
  it("returns ok:false on empty string", () => {
    expect(parseModelJson("", isStringArray)).toEqual({ ok: false });
  });
  it("returns ok:false on whitespace-only string", () => {
    expect(parseModelJson("   \n  ", isStringArray)).toEqual({ ok: false });
  });
});
