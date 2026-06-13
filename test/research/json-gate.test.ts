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
  it("recovers JSON from prose followed by a fenced block (Gemma chats before the JSON)", () => {
    const raw = "Sure! Here are the queries you asked for:\n```json\n[\"a\",\"b\"]\n```";
    expect(parseModelJson(raw, isStringArray)).toEqual({ ok: true, value: ["a", "b"] });
  });
  it("recovers JSON followed by trailing commentary (model keeps talking after the JSON)", () => {
    const raw = "```json\n[\"a\"]\n```\nLet me know if you need anything else!";
    expect(parseModelJson(raw, isStringArray)).toEqual({ ok: true, value: ["a"] });
  });
  it("recovers a fence embedded mid-paragraph (no leading/trailing anchor)", () => {
    const raw = "I think the best queries are ```[\"a\",\"b\",\"c\"]``` based on the claim.";
    expect(parseModelJson(raw, isStringArray)).toEqual({ ok: true, value: ["a", "b", "c"] });
  });
  it("recovers a bare JSON array embedded in prose with no fence at all (balanced-slice fallback)", () => {
    const raw = "Here you go: [\"a\",\"b\"] — hope that helps.";
    expect(parseModelJson(raw, isStringArray)).toEqual({ ok: true, value: ["a", "b"] });
  });
  it("does not be fooled by a bracket inside a string when slicing the balanced object", () => {
    const isObj = (v: unknown): v is { q: string } =>
      typeof v === "object" && v !== null && typeof (v as { q?: unknown }).q === "string";
    const raw = 'prefix {"q": "a ] bracket } inside"} suffix';
    expect(parseModelJson(raw, isObj)).toEqual({ ok: true, value: { q: "a ] bracket } inside" } });
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
