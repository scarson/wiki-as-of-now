// ABOUTME: Offline research-answer eval (corpus design §8): every Sam-verified gold evidence entry,
// ABOUTME: replayed through the real pipeline against its pinned snapshot, must survive verification.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { AnswerRecord } from "../gold/answer-record";
import { stripFrontmatter } from "../gold/answer-record";
import { researchClaim } from "../../src/research/pipeline";
import { verifyProposal } from "../../src/research/verify-proposal";
import { canonicalizeUrl } from "../../src/research/canonicalize-url";
import { fakeProvider } from "./fake-providers";
import type { SourceFetchResult, UntrustedSourceText } from "../../src/research/source-fetch";
import type { ProposedEvidence } from "../../src/research/provider";
import { normalizeForVerbatim } from "../../src/research/normalize";

const answers = JSON.parse(readFileSync("test/gold/answers.json", "utf8")) as AnswerRecord[];
const evidenced = answers.filter((r) => r.evidence.length > 0);

function snapshotBody(snapshotPath: string): string {
  return stripFrontmatter(readFileSync(snapshotPath, "utf8"));
}

/** Resolve fetches from the record's pinned snapshots — the offline stand-in for the live web. */
function snapshotFetcher(record: AnswerRecord): (url: string) => Promise<SourceFetchResult> {
  const byUrl = new Map(record.evidence.map((ev) => [ev.sourceUrl, ev.snapshot]));
  return async (url: string): Promise<SourceFetchResult> => {
    const snapshot = byUrl.get(url);
    if (!snapshot) return { ok: false, reason: "http_error" };
    return { ok: true, text: snapshotBody(snapshot) as UntrustedSourceText };
  };
}

function byUrlSnapshot(record: AnswerRecord, url: string): string {
  const ev = record.evidence.find((e) => e.sourceUrl === url);
  if (!ev) throw new Error(`no evidence for ${url}`);
  return ev.snapshot;
}

function proposalsOf(record: AnswerRecord): ProposedEvidence[] {
  return record.evidence.map((ev) => ({
    url: ev.sourceUrl,
    proposedQuote: ev.verbatimQuote,
    advisorySupport: ev.supportsStaleness,
  }));
}

const label = (r: AnswerRecord): string => `${r.fixture} :: ${r.sentenceSubstring.slice(0, 40)}`;

describe("gold-answer eval — the deterministic pipeline accepts every verified gold answer", () => {
  it("consumes a non-trivial corpus (composition guard)", () => {
    expect(answers.length).toBeGreaterThanOrEqual(30);
    expect(evidenced.length).toBeGreaterThanOrEqual(25);
  });

  it("every gold source URL survives canonicalization (none would be dropped as malformed)", () => {
    for (const r of evidenced) {
      for (const ev of r.evidence) {
        const c = canonicalizeUrl(ev.sourceUrl);
        expect(c.ok, `${label(r)} — ${ev.sourceUrl} must canonicalize`).toBe(true);
      }
    }
  });

  it("verifyProposal returns a card (never a drop) for every gold evidence entry, with snapshot-sliced context", async () => {
    let cardsWithContext = 0;
    let totalCards = 0;
    for (const r of evidenced) {
      const fetchSource = snapshotFetcher(r);
      for (const p of proposalsOf(r)) {
        const result = await verifyProposal(p, { fetchSource });
        expect(
          "verbatimQuote" in result,
          `${label(r)} — ${p.url} dropped: ${"reason" in result ? result.reason : "?"}`
        ).toBe(true);
        if ("verbatimQuote" in result) {
          totalCards++;
          expect(result.verbatimQuote).toBe(p.proposedQuote);
          // Context sides may be null at a paragraph edge (a gold quote can span a whole
          // paragraph — aducanumab does). The reconstructed [before][quote][after] window
          // must be one contiguous span of the normalized snapshot — this proves both
          // provenance AND adjacency, not merely that each side appears somewhere.
          const page = normalizeForVerbatim(snapshotBody(byUrlSnapshot(r, p.url)));
          const window =
            (result.contextBefore ?? "") + normalizeForVerbatim(p.proposedQuote) + (result.contextAfter ?? "");
          expect(page.includes(window), `${label(r)} — context+quote window is not a contiguous snapshot span`).toBe(
            true
          );
          if (result.contextBefore !== null || result.contextAfter !== null) cardsWithContext++;
        }
      }
    }
    // Anti-vacuity floor: if context slicing ever regressed to all-null the window check above
    // would still pass trivially. Today 36/39 cards carry context (three gold quotes span a
    // whole paragraph — aducanumab among them — which legitimately yields null on both sides);
    // floor set just under that. Re-baseline only when the corpus itself changes.
    expect(totalCards).toBe(39);
    expect(cardsWithContext, "context slicing looks vacuously null across the corpus").toBeGreaterThanOrEqual(35);
  });

  it("researchClaim (production caps) yields a card per gold evidence entry — nothing truncated, capped, or dropped", async () => {
    for (const r of evidenced) {
      const outcome = await researchClaim(
        {
          claimText: r.sentenceSubstring,
          sectionHeading: "",
          year: r.expectedYear ?? 0,
          sourceRevisionId: 1,
        },
        {
          provider: fakeProvider(proposalsOf(r), { queries: ["gold eval replay"] }),
          fetchSource: snapshotFetcher(r),
          now: new Date("2026-07-18T00:00:00Z"),
        }
      );
      expect(outcome.status, label(r)).toBe("proposals_present");
      if (outcome.status === "proposals_present") {
        expect(
          outcome.dispositions,
          `${label(r)} — pipeline dropped gold evidence`
        ).toEqual([]);
        expect(outcome.overCapCount, label(r)).toBe(0);
        // Each individual gold entry must survive as ITS OWN card, in order — a count
        // alone would pass if the pipeline duplicated or substituted cards.
        expect(
          outcome.cards.map((c) => ({ url: c.url, quote: c.verbatimQuote, advisory: c.advisorySupport })),
          label(r)
        ).toEqual(
          r.evidence.map((ev) => ({ url: ev.sourceUrl, quote: ev.verbatimQuote, advisory: ev.supportsStaleness }))
        );
      }
    }
  });

  it("a corrupted quote is refused for every record (the acceptance above is earned, not vacuous)", async () => {
    for (const r of evidenced) {
      const fetchSource = snapshotFetcher(r);
      const ev = r.evidence[0];
      const result = await verifyProposal(
        { url: ev.sourceUrl, proposedQuote: ev.verbatimQuote + " [tampered]", advisorySupport: true },
        { fetchSource }
      );
      expect("reason" in result, `${label(r)} — tampered quote must be dropped`).toBe(true);
    }
  });

  it("unverifiable records carry no evidence and are exercised nowhere above (explicit skip, not silence)", () => {
    const unverifiable = answers.filter((r) => r.disposition === "unverifiable");
    for (const r of unverifiable) expect(r.evidence).toEqual([]);
    expect(unverifiable.length + evidenced.length).toBe(answers.length);
  });
});
