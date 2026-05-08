import { getDb } from "../lib/db/client.js";

const db = getDb();
const customers = db
  .prepare("SELECT id, name, segment, is_real FROM customers WHERE id LIKE 'visitor-cust-%' ORDER BY id")
  .all();
const deals = db
  .prepare(
    "SELECT id, name, deal_type, acv, discount_pct, customer_id FROM deals WHERE id LIKE 'visitor-%' ORDER BY id",
  )
  .all();
const embeddings = db
  .prepare("SELECT deal_id FROM deal_embeddings WHERE deal_id LIKE 'visitor-%' ORDER BY deal_id")
  .all();
const reviews = db
  .prepare(
    "SELECT id, deal_id, is_visitor_submitted, slack_post_status FROM deal_reviews WHERE deal_id LIKE 'visitor-%' ORDER BY ran_at DESC",
  )
  .all();
console.log("customers:", customers);
console.log("deals:", deals);
console.log("embeddings:", embeddings);
console.log("reviews:", reviews);
