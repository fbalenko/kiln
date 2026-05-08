// One-shot cleanup: remove all visitor-* rows from the DB so committed
// kiln.db stays tidy. Mirrors the cascade order in deleteVisitorDealInner.

import { getDb } from "@/lib/db/client";

const db = getDb();
const before = {
  customers: (
    db.prepare("SELECT COUNT(*) AS n FROM customers WHERE id LIKE 'visitor-cust-%'").get() as { n: number }
  ).n,
  deals: (
    db.prepare("SELECT COUNT(*) AS n FROM deals WHERE id LIKE 'visitor-%'").get() as { n: number }
  ).n,
  embeddings: (
    db.prepare("SELECT COUNT(*) AS n FROM deal_embeddings WHERE deal_id LIKE 'visitor-%'").get() as { n: number }
  ).n,
  reviews: (
    db.prepare("SELECT COUNT(*) AS n FROM deal_reviews WHERE deal_id LIKE 'visitor-%'").get() as { n: number }
  ).n,
};

const tx = db.transaction(() => {
  db.prepare(
    `DELETE FROM audit_log
     WHERE review_id IN (SELECT id FROM deal_reviews WHERE deal_id LIKE 'visitor-%')`,
  ).run();
  db.prepare("DELETE FROM deal_reviews WHERE deal_id LIKE 'visitor-%'").run();
  db.prepare("DELETE FROM deal_embeddings WHERE deal_id LIKE 'visitor-%'").run();
  db.prepare("DELETE FROM deals WHERE id LIKE 'visitor-%'").run();
  db.prepare("DELETE FROM customers WHERE id LIKE 'visitor-cust-%'").run();
});
tx();

db.exec("VACUUM");

console.log("before:", before);
console.log("after — all visitor rows cleared, db vacuumed.");
