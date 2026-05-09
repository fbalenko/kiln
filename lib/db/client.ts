import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "node:fs";
import path from "node:path";
import { IS_VERCEL } from "@/lib/runtime";

export type DB = Database.Database;

const MIGRATIONS_DIR = path.resolve(process.cwd(), "db/migrations");

// Resolve db/kiln.db. On Vercel:
//   • The committed DB ships in /var/task/db/kiln.db (read-only fs).
//   • The seed file's journal_mode is WAL — opening it read-only at
//     /var/task throws SQLITE_CANTOPEN at the first .prepare() because
//     SQLite tries to attach the missing -wal/-shm journals on a
//     read-only filesystem.
//   • Working around that means either keeping the committed DB in
//     journal_mode=DELETE (requires releasing every dev-side write lock
//     to convert in place) or copying the file into a writable scratch
//     dir at boot. Vercel functions get an ephemeral /tmp (512 MB) that
//     survives the warm invocation. 8.88 MB copies in ~tens of ms.
//
// Local dev keeps the committed db/kiln.db path — no copy.
function resolveDbPath(): string {
  if (process.env.KILN_DB_PATH) return process.env.KILN_DB_PATH;

  if (IS_VERCEL) {
    const sources = [
      path.resolve(process.cwd(), "db/kiln.db"),
      "/var/task/db/kiln.db",
    ];
    const target = "/tmp/kiln.db";
    if (!fs.existsSync(target)) {
      for (const src of sources) {
        if (fs.existsSync(src)) {
          try {
            fs.copyFileSync(src, target);
            break;
          } catch (err) {
            console.warn(
              `[kiln-db] copy ${src} → ${target} failed:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
      }
    }
    return target;
  }

  return path.resolve(process.cwd(), "db/kiln.db");
}

const DB_PATH = resolveDbPath();

const globalForDb = globalThis as unknown as {
  __kilnDb?: DB;
  __kilnVecAvailable?: boolean;
};

export function getDb(): DB {
  if (globalForDb.__kilnDb) return globalForDb.__kilnDb;

  // Vercel: the seed has been copied to /tmp (writable, ephemeral). We
  // still want migrations off and journal mode flipped off WAL so a
  // process restart doesn't leave stale -wal/-shm files in /tmp that
  // confuse the next cold-start. The actual application code never
  // writes to SQL on Vercel — visitor data lives in process memory —
  // but better-sqlite3 still needs write capability to checkpoint.
  const handle = new Database(DB_PATH, { fileMustExist: true });

  if (IS_VERCEL) {
    // Force the local /tmp copy out of WAL mode so subsequent reads
    // don't try to open a missing journal.
    try {
      handle.pragma("journal_mode = DELETE");
    } catch (err) {
      console.warn(
        "[kiln-db] journal_mode=DELETE pragma failed:",
        err instanceof Error ? err.message : err,
      );
    }
  } else {
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
