import { NextRequest, NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@/lib/db/client";
import { getDealById } from "@/lib/db/queries";
import { IS_VERCEL } from "@/lib/runtime";
import { getReviewById } from "@/lib/db/in-memory-reviews";
import {
  ApprovalOutputSchema,
  Asc606OutputSchema,
  CommsOutputSchema,
  PricingOutputSchema,
  RedlineOutputSchema,
} from "@/lib/agents/schemas";
import {
  generateAeEmail,
} from "@/lib/document-templates/ae-email";
import { generateCustomerEmail } from "@/lib/document-templates/customer-email";
import { generateApprovalOnePager } from "@/lib/document-templates/approval-one-pager";
import { generateOrderForm } from "@/lib/document-templates/order-form";
import { generateRedlinedMsa } from "@/lib/document-templates/redlined-msa";
import { generateFinancialModel } from "@/lib/document-templates/spreadsheet";
import type {
  ArtifactBuffer,
  ArtifactInput,
} from "@/lib/document-templates/types";

// GET /api/artifacts/[reviewId]/[type]
//
// Returns a generated artifact (DOCX/PDF/EML) for the given review. The route
// resolves the review from one of two sources:
//   1. A live `deal_reviews` row, if reviewId starts with `rev_`
//   2. The orchestrator cache file, if reviewId matches a known deal id
//      (covers the demo flow where a visitor lands on a scenario page
//      without ever triggering a fresh run)
//
// Generated buffers are cached in-memory per (reviewId, type) for
// CACHE_TTL_MS so back-to-back clicks on the same button — or accidental
// double-clicks — don't re-render the artifact. Cache is process-local;
// serverless cold starts will rebuild as expected.

export const runtime = "nodejs";

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

const URL_TYPES = [
  "redlined-msa",
  "order-form",
  "ae-email",
  "customer-email",
  "one-pager",
  "financial-model",
] as const;
type UrlArtifactType = (typeof URL_TYPES)[number];

interface CacheEntry {
  buffer: Buffer;
  contentType: string;
  filename: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

interface Params {
  params: Promise<{ reviewId: string; type: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { reviewId, type } = await params;

  if (!URL_TYPES.includes(type as UrlArtifactType)) {
    return NextResponse.json(
      { error: "invalid_type", allowed: URL_TYPES },
      { status: 400 },
    );
  }

  const cacheKey = `${reviewId}::${type}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return artifactResponse(cached);
  }

  const input = resolveInput(reviewId);
  if (!input) {
    return NextResponse.json({ error: "review_not_found" }, { status: 404 });
  }

  let artifact: ArtifactBuffer;
  switch (type as UrlArtifactType) {
    case "redlined-msa":
      artifact = await generateRedlinedMsa(input);
      break;
    case "order-form":
      artifact = await generateOrderForm(input);
      break;
    case "ae-email":
      artifact = generateAeEmail(input);
      break;
    case "customer-email":
      artifact = generateCustomerEmail(input);
      break;
    case "one-pager":
      artifact = await generateApprovalOnePager(input);
      break;
    case "financial-model":
      artifact = await generateFinancialModel(input);
      break;
  }

  const entry: CacheEntry = {
    buffer: artifact.buffer,
    contentType: artifact.contentType,
    filename: artifact.filename,
    expiresAt: now + CACHE_TTL_MS,
  };
  cache.set(cacheKey, entry);
  pruneExpired(now);

  return artifactResponse(entry);
}

function artifactResponse(entry: CacheEntry): NextResponse {
  // Return a Uint8Array view because NextResponse types in Next.js 15 don't
  // accept Node Buffer directly.
  return new NextResponse(new Uint8Array(entry.buffer), {
    status: 200,
    headers: {
      "Content-Type": entry.contentType,
      "Content-Disposition": `attachment; filename="${entry.filename}"`,
      "Content-Length": String(entry.buffer.byteLength),
      "Cache-Control": "private, max-age=300",
    },
  });
}

function pruneExpired(now: number) {
  for (const [k, v] of cache) {
    if (v.expiresAt <= now) cache.delete(k);
  }
}

// Resolve a reviewId to the full ArtifactInput payload. Tries the DB first
// (for live runs); falls back to the seed cache file when reviewId looks
// like a deal_id, which is how the demo entry points reach artifacts before
// any orchestrator run has happened.
function resolveInput(reviewId: string): ArtifactInput | null {
  const generatedAt = new Date();
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (reviewId.startsWith("rev_")) {
    const live = loadFromDb(reviewId);
    if (live) {
      return { ...live, reviewId, appUrl, generatedAt };
    }
  }

  // Fallback: treat reviewId as a deal id and read the orchestrator cache.
  const cached = loadFromCache(reviewId);
  if (cached) {
    return { ...cached, reviewId, appUrl, generatedAt };
  }

  return null;
}

function loadFromDb(
  reviewId: string,
): Omit<ArtifactInput, "reviewId" | "appUrl" | "generatedAt"> | null {
  // Vercel: deal_reviews is empty (writes were redirected to memory).
  // Pull the bundle from the in-memory store; deal hydrates the same
  // way (visitor → in-memory store, hero → SQL).
  if (IS_VERCEL) {
    const bundle = getReviewById(reviewId);
    if (!bundle) return null;
    const deal = getDealById(bundle.review.deal_id);
    if (!deal) return null;
    return {
      deal,
      pricing: PricingOutputSchema.parse(
        JSON.parse(bundle.review.pricing_output_json),
      ),
      asc606: Asc606OutputSchema.parse(
        JSON.parse(bundle.review.asc606_output_json),
      ),
      redline: RedlineOutputSchema.parse(
        JSON.parse(bundle.review.redline_output_json),
      ),
      approval: ApprovalOutputSchema.parse(
        JSON.parse(bundle.review.approval_output_json),
      ),
      comms: CommsOutputSchema.parse(
        JSON.parse(bundle.review.comms_output_json),
      ),
      synthesis: bundle.review.synthesis_summary,
    };
  }

  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         deal_id,
         pricing_output_json, asc606_output_json, redline_output_json,
         approval_output_json, comms_output_json,
         synthesis_summary
       FROM deal_reviews
       WHERE id = ?`,
    )
    .get(reviewId) as
    | {
        deal_id: string;
        pricing_output_json: string;
        asc606_output_json: string;
        redline_output_json: string;
        approval_output_json: string;
        comms_output_json: string;
        synthesis_summary: string;
      }
    | undefined;

  if (!row) return null;
  const deal = getDealById(row.deal_id);
  if (!deal) return null;

  return {
    deal,
    pricing: PricingOutputSchema.parse(JSON.parse(row.pricing_output_json)),
    asc606: Asc606OutputSchema.parse(JSON.parse(row.asc606_output_json)),
    redline: RedlineOutputSchema.parse(JSON.parse(row.redline_output_json)),
    approval: ApprovalOutputSchema.parse(JSON.parse(row.approval_output_json)),
    comms: CommsOutputSchema.parse(JSON.parse(row.comms_output_json)),
    synthesis: row.synthesis_summary,
  };
}

function loadFromCache(
  dealId: string,
): Omit<ArtifactInput, "reviewId" | "appUrl" | "generatedAt"> | null {
  const path = join(CACHE_DIR, `${dealId}-review.json`);
  if (!existsSync(path)) return null;
  const deal = getDealById(dealId);
  if (!deal) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  const outputs = obj.outputs as Record<string, unknown> | undefined;
  if (!outputs) return null;

  return {
    deal,
    pricing: PricingOutputSchema.parse(outputs.pricing),
    asc606: Asc606OutputSchema.parse(outputs.asc606),
    redline: RedlineOutputSchema.parse(outputs.redline),
    approval: ApprovalOutputSchema.parse(outputs.approval),
    comms: CommsOutputSchema.parse(outputs.comms),
    synthesis: typeof obj.synthesis === "string" ? obj.synthesis : "",
  };
}
