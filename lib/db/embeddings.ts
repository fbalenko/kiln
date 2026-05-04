import OpenAI from "openai";
import type { DB } from "./client";

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 1536;

type DealRow = {
  id: string;
  customer_id: string;
  customer_name: string;
  segment: string;
  industry: string;
  employee_count: number;
  deal_type: string;
  acv: number;
  term_months: number;
  pricing_model: string;
  discount_pct: number;
  discount_reason: string | null;
  non_standard_clauses: string | null;
  customer_request: string;
  competitive_context: string | null;
};

// Embedding source format spec'd in docs/02-data-model.md.
export function buildEmbeddingText(d: DealRow): string {
  const clauses = d.non_standard_clauses
    ? (JSON.parse(d.non_standard_clauses) as string[]).join(", ")
    : "none";
  return [
    `Customer: ${d.customer_name} (${d.segment}, ${d.industry}, ${d.employee_count} employees)`,
    `Deal type: ${d.deal_type}`,
    `ACV: $${d.acv}, term: ${d.term_months}mo, pricing: ${d.pricing_model}`,
    `Discount: ${d.discount_pct}% — ${d.discount_reason ?? "n/a"}`,
    `Non-standard clauses: ${clauses}`,
    `Customer request: ${d.customer_request}`,
    `Competitive context: ${d.competitive_context ?? "n/a"}`,
  ].join("\n");
}

export async function embedAllDeals(db: DB): Promise<number> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error(
      "OPENAI_API_KEY is required for embedding generation. Set it in .env.local.",
    );
  }

  const rows = db
    .prepare(
      `
      SELECT
        d.id, d.customer_id, c.name AS customer_name, c.segment, c.industry,
        c.employee_count, d.deal_type, d.acv, d.term_months, d.pricing_model,
        d.discount_pct, d.discount_reason, d.non_standard_clauses,
        d.customer_request, d.competitive_context
      FROM deals d
      JOIN customers c ON c.id = d.customer_id
      ORDER BY d.id
      `,
    )
    .all() as DealRow[];

  const inputs = rows.map(buildEmbeddingText);

  const client = new OpenAI();
  const resp = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: inputs,
  });

  if (resp.data.length !== rows.length) {
    throw new Error(
      `Embedding count mismatch: got ${resp.data.length} for ${rows.length} deals`,
    );
  }

  // sqlite-vec virtual tables don't support UPSERT — delete then insert.
  // Embeddings are accepted as a Float32 buffer.
  const deleteOne = db.prepare(
    "DELETE FROM deal_embeddings WHERE deal_id = ?",
  );
  const insertOne = db.prepare(
    "INSERT INTO deal_embeddings (deal_id, embedding) VALUES (?, ?)",
  );

  const tx = db.transaction(() => {
    for (let i = 0; i < rows.length; i++) {
      const vec = resp.data[i].embedding;
      if (vec.length !== EMBEDDING_DIMS) {
        throw new Error(
          `Unexpected embedding length ${vec.length} (expected ${EMBEDDING_DIMS})`,
        );
      }
      const buf = Buffer.from(new Float32Array(vec).buffer);
      deleteOne.run(rows[i].id);
      insertOne.run(rows[i].id, buf);
    }
  });

  tx();
  return rows.length;
}
