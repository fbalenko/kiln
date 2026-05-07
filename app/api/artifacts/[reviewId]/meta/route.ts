import { NextResponse } from "next/server";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getDb } from "@/lib/db/client";

// Lightweight metadata for the artifacts panel — generated-at timestamp
// and source (cached scenario tape vs live run). Lets each download
// tile show the timestamp + cached/live badge without forcing the
// browser to fetch the actual artifact buffer.
//
// reviewId resolution mirrors the artifact route:
//   • rev_*   → look up deal_reviews.ran_at, source = "live"
//   • deal_*  → fall back to the cached scenario file, source = "cached"
// Anything else returns 404.

const CACHE_DIR = join(process.cwd(), "db", "seed", "cached_outputs");

interface ArtifactMeta {
  source: "live" | "cached";
  // ISO-8601 timestamp; the client renders it as a relative or
  // absolute string per its own preference.
  generatedAt: string;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  const { reviewId } = await params;

  if (reviewId.startsWith("rev_")) {
    const ts = lookupReviewTimestamp(reviewId);
    if (ts) {
      const meta: ArtifactMeta = { source: "live", generatedAt: ts };
      return NextResponse.json(meta);
    }
  }

  // Fallback: treat reviewId as a deal id and read the orchestrator cache.
  const cachedTs = lookupCacheTimestamp(reviewId);
  if (cachedTs) {
    const meta: ArtifactMeta = { source: "cached", generatedAt: cachedTs };
    return NextResponse.json(meta);
  }

  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

function lookupReviewTimestamp(reviewId: string): string | null {
  const db = getDb();
  const row = db
    .prepare(`SELECT ran_at FROM deal_reviews WHERE id = ?`)
    .get(reviewId) as { ran_at: string } | undefined;
  return row?.ran_at ?? null;
}

function lookupCacheTimestamp(dealId: string): string | null {
  const path = join(CACHE_DIR, `${dealId}-review.json`);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as {
      metadata?: { recorded_at?: string };
    };
    return parsed.metadata?.recorded_at ?? null;
  } catch {
    return null;
  }
}
