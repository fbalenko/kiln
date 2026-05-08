// Force a WAL checkpoint via the app's getDb (which loads sqlite-vec).
// Used after a dev-server crash leaves a stale WAL file that the
// sqlite3 CLI can't read because it lacks the vec0 module.

import { getDb } from "@/lib/db/client";

const db = getDb();
const before = db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
const integrity = db.prepare("PRAGMA integrity_check").all();
console.log("checkpoint:", before);
console.log("integrity:", integrity);
