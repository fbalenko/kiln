import { NextResponse } from "next/server";
import { listDeals } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export function GET() {
  const deals = listDeals();
  return NextResponse.json({
    count: deals.length,
    deals,
  });
}
