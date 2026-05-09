import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import path from "node:path";
import { IS_VERCEL } from "@/lib/runtime";

export type DB = Database.Database;

const DB_PATH =
  process.env.KILN_DB_PATH ?? path.resolve(process.cwd(), "db/kiln.db");
const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

const globalForDb = globalThis as unknown as {
  __kilnDb?: DB;
  __kilnVecAvailable?: boolean;
};

export function getDb(): DB {
  if (globalForDb.__kilnDb) return globalForDb.__kilnDb;

  // Vercel's serverless filesystem is read-only at runtime, so the
  // committed db/kiln.db must be opened readonly. WAL and migrations
  // both require write access — skip both. The committed DB already
  // has every migration applied at seed time.
  const handle = IS_VERCEL
    ? new Database(DB_PATH, { readonly: true, fileMustExist: true })
    : new Database(DB_PATH);

  if (!IS_VERCEL) {
    handle.pragma("journal_mode = WAL");
  }
  handle.pragma("foreign_keys = ON");

  // sqlite-vec resolves its native extension at runtime via
  // import.meta.resolve("sqlite-vec-<platform>-<arch>/vec0.so"). On
  // Vercel that lookup can fail if the file tracer didn't drag the
  // platform binary into /var/task/node_modules — and without the
  // extension, vector-search.ts's `embedding MATCH ?` queries throw.
  // Keep the load attempt but don't let a missing binary 500 every
  // route that touches the DB; downstream callers (findSimilarDeals)
  // already degrade to empty results when k-NN is unavailable.
  globalForDb.__kilnVecAvailable = false;
  try {
    sqliteVec.load(handle);
    globalForDb.__kilnVecAvailable = true;
  } catch (err) {
    console.warn(
      "[kiln-db] sqlite-vec extension load failed — vector k-NN disabled. " +
        "Cause:",
      err instanceof Error ? err.message : err,
    );
  }

  if (!IS_VERCEL) {
    runMigrations(handle);
  }

  globalForDb.__kilnDb = handle;
  return handle;
}

export function isVectorSearchAvailable(): boolean {
  return globalForDb.__kilnVecAvailable === true;
}

function runMigrations(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const applied = new Set(
    db
      .prepare("SELECT filename FROM _migrations")
      .all()
      .map((row) => (row as { filename: string }).filename),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const insert = db.prepare(
    "INSERT INTO _migrations (filename) VALUES (?)",
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    db.transaction(() => {
      db.exec(sql);
      insert.run(file);
    })();
  }
}
