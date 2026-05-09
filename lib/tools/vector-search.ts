import { getDb } from "@/lib/db/client";
import { getVisitorDealRecord } from "@/lib/visitor-submit/store";

const VISITOR_PREFIX = "visitor-";

// k-NN lookup over `deal_embeddings` (sqlite-vec virtual table). The seed
// step embeds all 40 deals on first run; this module just reads.
//
// docs/06-integrations.md §Vector search:
//   • Filter out the source deal itself
//   • Show similarity as a 0–100 percentage, not raw cosine distance
//   • Each card carries a one-line "decision note" pulled from the deal record
//
// We don't have full deal_review records for closed deals (that's Phase 4
// territory only for the 5 hero scenarios), so the decision note for closed
// deals is sourced from `deals.customer_request` — those strings were written
// in the seed to read like outcome notes ("Closed in Q1 with quick legal
// turn", "Lost to Apollo on price + procurement timing").

export interface SimilarDealRecord {
  deal_id: string;
  deal_name: string;
  customer_name: string;
  customer_segment: string;
  deal_type: string;
  stage: string;
  acv: number;
  discount_pct: number;
  decision_note: string;
  similarity_pct: number; // 0..100, higher = more similar
  is_scenario: number;
}

interface KnnRow {
  deal_id: string;
  distance: number;
}

interface DealMetaRow {
  id: string;
  name: string;
  deal_type: string;
  stage: string;
  acv: number;
  discount_pct: number;
  customer_request: string;
  is_scenario: number;
  customer_name: string;
  customer_segment: string;
}

export async function findSimilarDeals(
  sourceDealId: string,
  k = 3,
): Promise<SimilarDealRecord[]> {
  const db = getDb();

  // Visitor deals on Vercel don't get a row in deal_embeddings (the
  // table is read-only there). The visitor store carries the freshly
  // generated embedding instead; fall back to SQL for hero scenarios.
  let sourceEmbedding: Buffer | null = null;
  if (sourceDealId.startsWith(VISITOR_PREFIX)) {
    const record = getVisitorDealRecord(sourceDealId);
    sourceEmbedding = record?.embedding ?? null;
  }
  if (!sourceEmbedding) {
    const sourceRow = db
      .prepare("SELECT embedding FROM deal_embeddings WHERE deal_id = ?")
      .get(sourceDealId) as { embedding: Buffer } | undefined;
    sourceEmbedding = sourceRow?.embedding ?? null;
  }

  if (!sourceEmbedding) {
    return [];
  }

  // Pull k+1 so we can drop the source deal itself if it shows up first
  // (cosine distance to itself is ~0). sqlite-vec wants the limit baked into
  // the query expression — we ask for k+2 for headroom in case the seed is
  // not yet embedded for all deals.
  const limit = k + 2;
  const knnRows = db
    .prepare(
      `
      SELECT deal_id, distance
      FROM deal_embeddings
      WHERE embedding MATCH ?
        AND k = ?
      ORDER BY distance ASC
      `,
    )
    .all(sourceEmbedding, limit) as KnnRow[];

  const filtered = knnRows
    .filter((r) => r.deal_id !== sourceDealId)
    .slice(0, k);

  if (filtered.length === 0) return [];

  const placeholders = filtered.map(() => "?").join(",");
  const metaRows = db
    .prepare(
      `
      SELECT
        d.id, d.name, d.deal_type, d.stage, d.acv, d.discount_pct,
        d.customer_request, d.is_scenario,
        c.name AS customer_name, c.segment AS customer_segment
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      WHERE d.id IN (${placeholders})
      `,
    )
    .all(...filtered.map((r) => r.deal_id)) as DealMetaRow[];

  const metaById = new Map<string, DealMetaRow>(
    metaRows.map((r) => [r.id, r]),
  );

  // Preserve the k-NN order returned by sqlite-vec.
  return filtered
    .map((r) => {
      const meta = metaById.get(r.deal_id);
      if (!meta) return null;
      return {
        deal_id: meta.id,
        deal_name: meta.name,
        customer_name: meta.customer_name,
        customer_segment: meta.customer_segment,
        deal_type: meta.deal_type,
        stage: meta.stage,
        acv: meta.acv,
        discount_pct: meta.discount_pct,
        decision_note: oneLine(meta.customer_request),
        similarity_pct: distanceToSimilarity(r.distance),
        is_scenario: meta.is_scenario,
      };
    })
    .filter((x): x is SimilarDealRecord => x !== null);
}

// sqlite-vec returns L2 distance for FLOAT columns. Embeddings from
// text-embedding-3-small are unit-normalized, so squared L2 distance = 2(1 -
// cos_sim), which gives a clean mapping to a 0..100 "similar" scale.
function distanceToSimilarity(distance: number): number {
  // Normalized embeddings → distance ∈ [0, 2]. Map to similarity ∈ [0, 100].
  const sim = 1 - distance / 2;
  return Math.max(0, Math.min(100, Math.round(sim * 100)));
}

function oneLine(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 240) return trimmed;
  return trimmed.slice(0, 237).trimEnd() + "…";
}
