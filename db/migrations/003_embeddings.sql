-- 003_embeddings.sql
-- sqlite-vec virtual table for k-NN similarity search over deals.
-- Embedding model: text-embedding-3-small (1536 dims).

CREATE VIRTUAL TABLE IF NOT EXISTS deal_embeddings USING vec0(
  deal_id TEXT PRIMARY KEY,
  embedding FLOAT[1536]
);
