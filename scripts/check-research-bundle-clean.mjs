// ABOUTME: Build-time backstop — fails if the research worker's import graph reaches better-sqlite3/local-db.
// ABOUTME: Defense-in-depth second layer behind the ESLint no-restricted-imports rule (CC-5, design §5.6).
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";

// Match the forbidden specifiers ONLY where they appear as an import/export module string —
// quote- or slash-bounded — so a prose comment mentioning "better-sqlite3" (e.g. in
// src/db/client.ts, which only documents the adapter, never imports it) is not a false positive.
const FORBIDDEN = [/(?:^|["'/])better-sqlite3(?:["'/]|$)/, /local-db(?:\.[mc]?[jt]s)?["']/];
const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']/g;
const BARE_IMPORT_RE = /import\s*["']([^"']+)["']/g;
const EXTS = [".ts", ".tsx", ".mts", ".js", ".mjs", ".jsx", ".cjs"];

function resolveSpecifier(spec, fromFile) {
  if (!spec.startsWith(".") && !spec.startsWith("/")) return null; // bare package — leaf
  const base = resolve(dirname(fromFile), spec);
  if (existsSync(base) && extname(base)) return base;
  for (const ext of EXTS) if (existsSync(base + ext)) return base + ext;
  for (const ext of EXTS) if (existsSync(resolve(base, "index" + ext))) return resolve(base, "index" + ext);
  return null;
}

export function findForbiddenImports(entryFile, _seen = new Set(), _violations = []) {
  const file = existsSync(entryFile) ? entryFile : EXTS.map((e) => entryFile + e).find(existsSync);
  if (!file || _seen.has(file)) return _violations;
  _seen.add(file);
  const src = readFileSync(file, "utf8");
  for (const re of FORBIDDEN) {
    if (re.test(src)) _violations.push(`${file}: forbidden import matching ${re}`);
  }
  const specs = new Set();
  for (const m of src.matchAll(IMPORT_RE)) specs.add(m[1]);
  for (const m of src.matchAll(BARE_IMPORT_RE)) specs.add(m[1]);
  for (const spec of specs) {
    const next = resolveSpecifier(spec, file);
    if (next) findForbiddenImports(next, _seen, _violations);
  }
  return _violations;
}

// CLI: node scripts/check-research-bundle-clean.mjs [entry]
if (import.meta.url === `file://${process.argv[1]}`) {
  const entry = process.argv[2] ?? resolve(process.cwd(), "workers/research/index.ts");
  const violations = findForbiddenImports(entry);
  if (violations.length) {
    console.error("Research bundle cleanliness FAILED — forbidden imports reachable from", entry);
    for (const v of violations) console.error("  " + v);
    process.exit(1);
  }
  console.log("Research bundle clean:", entry);
}
