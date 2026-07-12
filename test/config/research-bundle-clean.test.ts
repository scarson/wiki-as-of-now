// ABOUTME: Verifies the research-worker bundle-cleanliness backstop catches better-sqlite3/local-db.
// ABOUTME: Positive: real entry is clean. Negative: planted direct + transitive forbidden imports are detected.
import { describe, it, expect } from "vitest";
import { findForbiddenImports } from "../../scripts/check-research-bundle-clean.mjs";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(__dirname, "../..");

describe("research bundle cleanliness (Task 7.3)", () => {
  it("the real research worker entry has no forbidden imports", () => {
    const violations = findForbiddenImports(resolve(root, "workers/research/index.ts"));
    expect(violations).toEqual([]);
  });

  it("catches a planted better-sqlite3 import in a reachable module", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-check-"));
    const bad = join(dir, "bad.ts");
    const entry = join(dir, "entry.ts");
    writeFileSync(bad, `import Database from "better-sqlite3";\nexport const x = Database;\n`);
    writeFileSync(entry, `import { x } from "./bad";\nexport default x;\n`);
    const violations = findForbiddenImports(entry);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => /better-sqlite3/.test(v))).toBe(true);
  });

  it("catches a transitive local-db import two hops deep", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-check-"));
    const leaf = join(dir, "leaf.ts");
    const mid = join(dir, "mid.ts");
    const entry = join(dir, "entry.ts");
    writeFileSync(leaf, `export { betterSqliteExecutor } from "../../src/db/local-db";\n`);
    writeFileSync(mid, `export * from "./leaf";\n`);
    writeFileSync(entry, `import * as m from "./mid";\nexport default m;\n`);
    const violations = findForbiddenImports(entry);
    expect(violations.some((v) => /local-db/.test(v))).toBe(true);
  });

  it("returns clean for a small entry whose graph touches nothing forbidden", () => {
    const dir = mkdtempSync(join(tmpdir(), "bundle-check-"));
    const dep = join(dir, "dep.ts");
    const entry = join(dir, "entry.ts");
    writeFileSync(dep, `export const greet = (n: string) => "hi " + n;\n`);
    writeFileSync(entry, `import { greet } from "./dep";\nexport default greet;\n`);
    expect(findForbiddenImports(entry)).toEqual([]);
  });
});
