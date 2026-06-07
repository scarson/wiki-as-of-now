// ABOUTME: Persistence for LLM research results per (claim_key, source_revision_id).
// ABOUTME: Write-once insert (metered LLM spend), defensive read with per-field JSON parsing, revision-match surfacing.
import type { EvidenceCard } from "../research/provider";
import type { DroppedProposal } from "../research/verify-proposal";
import { MIN_QUOTE_LEN, MAX_QUOTE_LEN } from "../research/verbatim-check";
import type { SqlExecutor } from "./client";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ResearchPack {
  claimKey: string;
  sourceRevisionId: number;
  pageId: number;
  sectionHeading: string;
  sentenceText: string;
  year: number;
  providerName: string;
  modelVersion: string;
  status: "no_proposals" | "proposals_present";
  queries: string[];
  cards: EvidenceCard[];
  dispositions: DroppedProposal[];
  evaluatedAt: string;
}

export type ResearchPackRead =
  | { state: "found"; pack: ResearchPack }
  | { state: "pack_unreadable" }
  | { state: "not_found" };

// ---------------------------------------------------------------------------
// computeClaimKey
// ---------------------------------------------------------------------------

/**
 * SHA-256 hex over a byte-length-prefixed, NFC-normalized canonical form of
 * (pageId, sectionHeading, sentenceText, year). Length prefixes prevent
 * field-boundary ambiguity (collision-safe). Strings are NFC-normalized
 * (identity normalization, not the verbatim fold).
 *
 * Cross-runtime via crypto.subtle — no Node.js-specific imports.
 */
export async function computeClaimKey(
  pageId: number,
  sectionHeading: string,
  sentenceText: string,
  year: number,
): Promise<string> {
  const enc = new TextEncoder();
  // Byte-length-prefixed canonical serialization — length prefixes prevent field-boundary ambiguity
  // (collision-safe). String fields are NFC-normalized (identity normalization, not the verbatim fold).
  const fields = [String(pageId), sectionHeading.normalize("NFC"), sentenceText.normalize("NFC"), String(year)];
  const parts: Uint8Array[] = [];
  for (const f of fields) {
    const b = enc.encode(f);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(0, b.byteLength, false); // big-endian length prefix
    parts.push(len, b);
  }
  let total = 0; for (const p of parts) total += p.byteLength;
  const buf = new Uint8Array(total);
  let o = 0; for (const p of parts) { buf.set(p, o); o += p.byteLength; }
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Raw row shape from the database
// ---------------------------------------------------------------------------

interface RawPackRow {
  claim_key: string;
  source_revision_id: number;
  page_id: number;
  section_heading: string;
  sentence_text: string;
  year: number;
  provider_name: string;
  model_version: string;
  status: string;
  queries_json: string;
  cards_json: string;
  dispositions_json: string;
  evaluated_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a raw database row into a ResearchPack, returning null on any error. */
function parseRow(row: RawPackRow): ResearchPack | null {
  let queries: unknown;
  let cards: unknown;
  let dispositions: unknown;

  try { queries = JSON.parse(row.queries_json); } catch { return null; }
  try { cards = JSON.parse(row.cards_json); } catch { return null; }
  try { dispositions = JSON.parse(row.dispositions_json); } catch { return null; }

  if (!Array.isArray(queries) || !Array.isArray(cards) || !Array.isArray(dispositions)) {
    return null;
  }

  // Validate status enum (backstop in case a row was somehow corrupted post-insert).
  if (row.status !== "no_proposals" && row.status !== "proposals_present") {
    return null;
  }

  // Read-time G16 cap validation — defense in depth against a corrupted row that
  // bypassed the write path. Rejects any card whose verbatimQuote is outside the
  // [MIN_QUOTE_LEN, MAX_QUOTE_LEN] range (code points).
  for (const card of cards as EvidenceCard[]) {
    if (typeof card !== "object" || card === null || typeof card.verbatimQuote !== "string") {
      return null;
    }
    const qLen = [...card.verbatimQuote].length;
    if (qLen < MIN_QUOTE_LEN || qLen > MAX_QUOTE_LEN) {
      return null;
    }
  }

  return {
    claimKey: row.claim_key,
    sourceRevisionId: row.source_revision_id,
    pageId: row.page_id,
    sectionHeading: row.section_heading,
    sentenceText: row.sentence_text,
    year: row.year,
    providerName: row.provider_name,
    modelVersion: row.model_version,
    status: row.status as "no_proposals" | "proposals_present",
    queries: queries as string[],
    cards: cards as EvidenceCard[],
    dispositions: dispositions as DroppedProposal[],
    evaluatedAt: row.evaluated_at,
  };
}

/** Convert a parsed row to a ResearchPackRead, logging on unreadable. */
function toReadResult(row: RawPackRow | null): ResearchPackRead {
  if (row === null) return { state: "not_found" };
  const pack = parseRow(row);
  if (pack === null) {
    console.error("research_packs: unreadable row — JSON parse or validation failure", {
      claim_key: row.claim_key,
      source_revision_id: row.source_revision_id,
    });
    return { state: "pack_unreadable" };
  }
  return { state: "found", pack };
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

/**
 * True iff a row exists for (claimKey, sourceRevisionId). Cheap SELECT 1 — does not parse the pack.
 */
export async function packExists(db: SqlExecutor, claimKey: string, sourceRevisionId: number): Promise<boolean> {
  const rows = await db
    .prepare("SELECT 1 AS one FROM research_packs WHERE claim_key = ? AND source_revision_id = ?")
    .bind(claimKey, sourceRevisionId)
    .all<{ one: number }>();
  return rows.length > 0;
}

/**
 * Write-once insert: stores a research pack only if no row with the same
 * (claim_key, source_revision_id) already exists. Silently ignores conflicts.
 *
 * This intentionally diverges from the verdict upsert pattern: a pack represents
 * metered LLM spend. Re-delivering the same claim/revision must never overwrite
 * an existing result — idempotent re-delivery is the safe default, and any
 * reconciliation (e.g. if the model version changes) requires an explicit delete
 * followed by a fresh insert.
 */
export async function insertPackIfAbsent(db: SqlExecutor, pack: ResearchPack): Promise<void> {
  await db
    .prepare(
      "INSERT INTO research_packs " +
      "(claim_key, source_revision_id, page_id, section_heading, sentence_text, year, " +
      "provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
      "ON CONFLICT(claim_key, source_revision_id) DO NOTHING"
    )
    .bind(
      pack.claimKey,
      pack.sourceRevisionId,
      pack.pageId,
      pack.sectionHeading,
      pack.sentenceText,
      pack.year,
      pack.providerName,
      pack.modelVersion,
      pack.status,
      JSON.stringify(pack.queries),
      JSON.stringify(pack.cards),
      JSON.stringify(pack.dispositions),
      pack.evaluatedAt,
    )
    .run();
}

/**
 * Reads a research pack by (claimKey, sourceRevisionId).
 *
 * Defensive: wraps per-field JSON.parse in try/catch; on any parse error or
 * read-time validation failure (G16 quote length cap, status enum) returns
 * { state: "pack_unreadable" } without throwing.
 */
export async function getPack(
  db: SqlExecutor,
  claimKey: string,
  sourceRevisionId: number,
): Promise<ResearchPackRead> {
  const rows = await db
    .prepare(
      "SELECT claim_key, source_revision_id, page_id, section_heading, sentence_text, year, " +
      "provider_name, model_version, status, queries_json, cards_json, dispositions_json, evaluated_at " +
      "FROM research_packs WHERE claim_key = ? AND source_revision_id = ?"
    )
    .bind(claimKey, sourceRevisionId)
    .all<RawPackRow>();

  const row = rows[0] ?? null;
  return toReadResult(row);
}

/**
 * Removes a single research pack row identified by (claimKey, sourceRevisionId).
 * The research_packs table is mutable cache/history; the audit log is the
 * append-only record. Deletion is allowed here to prune obsolete LLM results.
 */
export async function deletePack(
  db: SqlExecutor,
  claimKey: string,
  sourceRevisionId: number,
): Promise<void> {
  await db
    .prepare("DELETE FROM research_packs WHERE claim_key = ? AND source_revision_id = ?")
    .bind(claimKey, sourceRevisionId)
    .run();
}

/**
 * Returns the research pack for (claimKey, pageId) only when its
 * source_revision_id matches the article's current revision_id. A pack
 * researched at an older revision is not surfaceable — returning stale
 * evidence to an editor without revision context would be misleading.
 *
 * Uses the same defensive read path as getPack.
 */
export async function getSurfaceablePack(
  db: SqlExecutor,
  claimKey: string,
  pageId: number,
): Promise<ResearchPackRead> {
  const rows = await db
    .prepare(
      "SELECT rp.claim_key, rp.source_revision_id, rp.page_id, rp.section_heading, rp.sentence_text, " +
      "rp.year, rp.provider_name, rp.model_version, rp.status, rp.queries_json, rp.cards_json, " +
      "rp.dispositions_json, rp.evaluated_at " +
      "FROM research_packs rp " +
      "JOIN articles a ON a.page_id = rp.page_id AND rp.source_revision_id = a.revision_id " +
      "WHERE rp.claim_key = ? AND rp.page_id = ?"
    )
    .bind(claimKey, pageId)
    .all<RawPackRow>();

  const row = rows[0] ?? null;
  return toReadResult(row);
}
