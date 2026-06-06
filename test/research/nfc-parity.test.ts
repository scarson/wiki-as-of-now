import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeForVerbatim } from "../../src/research/normalize";

// workerd-vs-Node NFC PARITY gate: the fixture is generated on workerd via `pnpm gen:nfc-golden`.
// Split-brain normalization would silently corrupt claim_key (a PK component). Regenerate the fixture
// when the corpus or normalize.ts changes.
import { NFC_CORPUS } from "../fixtures/nfc-corpus"; // the SAME corpus gen:nfc-golden ran on workerd
const golden: { input: string; output: string }[] = JSON.parse(readFileSync("test/fixtures/nfc-golden-workerd.json", "utf8"));

describe("NFC normalization is workerd↔Node parity-stable", () => {
  it("matches the committed workerd golden for every corpus case", () => {
    expect(golden.length).toBeGreaterThanOrEqual(12); // composition guard: corpus must be non-trivial
    expect(golden.map((g) => g.input)).toEqual([...NFC_CORPUS]); // coverage: a stale golden (missing new cases) fails loudly
    for (const { input, output } of golden) {
      expect(normalizeForVerbatim(input)).toBe(output);
    }
  });
});
