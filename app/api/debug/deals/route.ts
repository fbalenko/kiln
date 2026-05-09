import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { listDeals } from "@/lib/db/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  // Diagnostic mode: report exactly what blew up. Surfaces the runtime
  // error message + filesystem state, since Vercel logs aren't visible
  // to the deploy probe.
  try {
    const deals = listDeals();
    return NextResponse.json({
      ok: true,
      count: deals.length,
      sample: deals.slice(0, 2).map((d) => ({ id: d.id, name: d.name })),
    });
  } catch (err) {
    const e = err as Error & { code?: string };
    const cwd = process.cwd();
    const candidates = [
      path.resolve(cwd, "db/kiln.db"),
      "/var/task/db/kiln.db",
    ];
    const probe = candidates.map((p) => ({
      path: p,
      exists: safeExists(p),
      size: safeSize(p),
    }));
    let cwdListing: string[] = [];
    try {
      cwdListing = fs.readdirSync(cwd).slice(0, 30);
    } catch {
      /* swallow */
    }
    let dbDirListing: string[] = [];
    try {
      dbDirListing = fs.readdirSync(path.resolve(cwd, "db")).slice(0, 30);
    } catch {
      /* swallow */
    }
    let nmSqliteVec: string[] = [];
    try {
      nmSqliteVec = fs
        .readdirSync(path.resolve(cwd, "node_modules"))
        .filter((d) => d.startsWith("sqlite-vec"))
        .slice(0, 10);
    } catch {
      /* swallow */
    }
    return NextResponse.json(
      {
        ok: false,
        error: e.message,
        code: e.code,
        stack: e.stack?.split("\n").slice(0, 6),
        env: {
          VERCEL: process.env.VERCEL ?? null,
          VERCEL_ENV: process.env.VERCEL_ENV ?? null,
          NODE_ENV: process.env.NODE_ENV ?? null,
          KILN_DB_PATH: process.env.KILN_DB_PATH ?? null,
        },
        cwd,
        candidates: probe,
        cwd_listing: cwdListing,
        db_dir_listing: dbDirListing,
        sqlite_vec_packages_in_node_modules: nmSqliteVec,
      },
      { status: 500 },
    );
  }
}

function safeExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function safeSize(p: string): number | null {
  try {
    return fs.statSync(p).size;
  } catch {
    return null;
  }
}
